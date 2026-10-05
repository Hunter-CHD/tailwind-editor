import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Exercise the storage model without starting the editor or its CDN libraries.
  await page.goto('./preview.html');
});

async function storedRecords(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('tailwind-editor');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction([
      'workspaces',
      'documentFiles',
      'documentMetadata',
      'transformations',
    ]);
    const workspace = transaction.objectStore('workspaces').get('workspace');
    const files = transaction.objectStore('documentFiles').getAll();
    const metadata = transaction.objectStore('documentMetadata').getAll();
    const transformations = transaction.objectStore('transformations').getAll();
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
    return {
      version: database.version,
      workspace: workspace.result,
      metadata: metadata.result,
      transformations: transformations.result,
      files: await Promise.all(
        files.result.map(async ({ id, file }) => ({
          id,
          isFile: file instanceof File,
          name: file.name,
          type: file.type,
          content: await file.text(),
        })),
      ),
    };
  });
}

async function instrumentWrites(page) {
  await page.evaluate(() => {
    window.storageWrites = [];
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, ...args) {
      window.storageWrites.push({ store: this.name, id: value.id || args[0] });
      return original.call(this, value, ...args);
    };
  });
}

test('documents are HTML Files with linked metadata and only changed records are written', async ({
  page,
}) => {
  const workspace = await page.evaluate(async () => {
    const { loadWorkspace, saveWorkspace } = await import('./app/Models/Workspace.js');
    const { newDocument } = await import('./config/editor.js');
    const { workspace } = await loadWorkspace();
    workspace.documents[0].content = '<p>First 📄</p>\r\n';
    workspace.documents.push(newDocument('Second.html', '<p>Second</p>'));
    workspace.activeId = workspace.documents[1].id;
    await saveWorkspace(workspace);
    return workspace;
  });
  const records = await storedRecords(page);
  expect(records.version).toBe(3);
  expect(records.workspace.documentIds).toEqual(workspace.documents.map((item) => item.id));
  expect(records.workspace).not.toHaveProperty('documents');
  for (const document of workspace.documents) {
    expect(records.files.find((item) => item.id === document.id)).toEqual({
      id: document.id,
      isFile: true,
      name: document.name,
      type: 'text/html;charset=utf-8',
      content: document.content,
    });
    expect(records.metadata.find((item) => item.id === document.id)).toEqual({
      id: document.id,
      name: document.name,
      colors: document.colors,
      safelist: document.safelist,
      preflight: document.preflight,
    });
  }
  await instrumentWrites(page);
  const writes = await page.evaluate(async () => {
    const { loadWorkspace, saveWorkspace } = await import('./app/Models/Workspace.js');
    const { workspace } = await loadWorkspace();
    await saveWorkspace(workspace);
    const unchanged = window.storageWrites.splice(0);
    workspace.documents[0].content = '<p>Edited</p>';
    await saveWorkspace(workspace);
    const source = window.storageWrites.splice(0);
    workspace.documents[0].preflight = false;
    workspace.documents[0].safelist = 'hidden';
    await saveWorkspace(workspace);
    const metadata = window.storageWrites.splice(0);
    workspace.settings.fontSize = 18;
    await saveWorkspace(workspace);
    const settings = window.storageWrites.splice(0);
    workspace.documents[0].name = 'Renamed.html';
    await saveWorkspace(workspace);
    return { unchanged, source, metadata, settings, rename: window.storageWrites.splice(0) };
  });
  expect(writes.unchanged).toEqual([]);
  expect(writes.source).toEqual([{ store: 'documentFiles', id: workspace.documents[0].id }]);
  expect(writes.metadata).toEqual([{ store: 'documentMetadata', id: workspace.documents[0].id }]);
  expect(writes.settings).toEqual([{ store: 'workspaces', id: 'workspace' }]);
  expect(writes.rename).toEqual([
    { store: 'documentFiles', id: workspace.documents[0].id },
    { store: 'documentMetadata', id: workspace.documents[0].id },
  ]);
  await page.reload();
  const loaded = await page.evaluate(
    async () => (await (await import('./app/Models/Workspace.js')).loadWorkspace()).workspace,
  );
  expect(loaded.documents[0]).toMatchObject({
    name: 'Renamed.html',
    content: '<p>Edited</p>',
    preflight: false,
    safelist: 'hidden',
  });
  expect(loaded.documents[1]).toEqual(workspace.documents[1]);
  expect(loaded.activeId).toBe(workspace.activeId);
});

test('deletion removes both records and JSON backups restore IDs, order, and settings', async ({
  page,
}) => {
  const backup = await page.evaluate(async () => {
    const { loadWorkspace, saveWorkspace } = await import('./app/Models/Workspace.js');
    const { newDocument } = await import('./config/editor.js');
    const { workspace } = await loadWorkspace();
    workspace.documents.unshift(newDocument('First.html', '<p>First</p>'));
    workspace.documents.push(newDocument('Last.html', '<p>Last</p>'));
    workspace.transformations = [
      {
        id: 'keep-transform-id',
        name: 'Transform',
        code: 'return code;',
        enabled: true,
        mode: 'manual',
        target: 'editor',
        kind: 'string',
      },
    ];
    await saveWorkspace(workspace);
    const backup = JSON.stringify(workspace);
    workspace.documents = [workspace.documents[2]];
    workspace.activeId = workspace.documents[0].id;
    await saveWorkspace(workspace);
    return backup;
  });
  const afterDelete = await storedRecords(page);
  expect(afterDelete.files).toHaveLength(1);
  expect(afterDelete.metadata).toHaveLength(1);
  expect(afterDelete.workspace.documentIds).toEqual([afterDelete.files[0].id]);
  const restored = await page.evaluate(async (backup) => {
    const { loadWorkspace, saveWorkspace, validateWorkspace } = await import(
      './app/Models/Workspace.js'
    );
    await saveWorkspace(validateWorkspace(JSON.parse(backup)));
    return (await loadWorkspace()).workspace;
  }, backup);
  expect(restored).toEqual(JSON.parse(backup));
  expect((await storedRecords(page)).files).toHaveLength(3);
});

test('failed transactions roll back files, metadata, and workspace changes and can be retried', async ({
  page,
}) => {
  await page.evaluate(async () => (await import('./app/Models/Workspace.js')).loadWorkspace());
  const before = await storedRecords(page);
  const result = await page.evaluate(async () => {
    const { loadWorkspace, saveWorkspace } = await import('./app/Models/Workspace.js');
    const { workspace } = await loadWorkspace();
    workspace.documents[0].content = '<p>New content</p>';
    workspace.documents[0].safelist = 'hidden';
    workspace.settings.fontSize = 20;
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (this.name === 'documentMetadata')
        throw new DOMException('Simulated storage full', 'QuotaExceededError');
      return original.call(this, value, ...args);
    };
    let error;
    try {
      await saveWorkspace(workspace);
    } catch (failure) {
      error = failure.message;
    } finally {
      IDBObjectStore.prototype.put = original;
    }
    return { workspace, error };
  });
  expect(result.error).toContain('Simulated storage full');
  expect(await storedRecords(page)).toEqual(before);
  await page.evaluate(
    async (workspace) => (await import('./app/Models/Workspace.js')).saveWorkspace(workspace),
    result.workspace,
  );
  expect((await storedRecords(page)).files[0].content).toBe('<p>New content</p>');
});

test('the previous single-record database migrates without losing document or transformation IDs', async ({
  page,
}) => {
  const original = await page.evaluate(async () => {
    const { newWorkspace, newDocument } = await import('./config/editor.js');
    const workspace = newWorkspace();
    workspace.documents = [
      newDocument('One.html', '<p>One</p>'),
      newDocument('Two.html', '<p>Two</p>'),
    ];
    workspace.documents[1].colors.brand = '#ff0000';
    workspace.documents[1].preflight = false;
    workspace.documents[1].safelist = 'hidden';
    workspace.activeId = workspace.documents[1].id;
    workspace.transformations = [
      {
        id: 'trusted',
        name: 'Keep enabled',
        code: 'return code;',
        enabled: true,
        mode: 'auto',
        target: 'editor',
        kind: 'string',
      },
    ];
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('tailwind-editor', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('workspaces');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('workspaces', 'readwrite');
        transaction.objectStore('workspaces').put(workspace, 'workspace');
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error);
        };
      };
    });
    return workspace;
  });
  const failedMigration = await page.evaluate(async () => {
    const { loadWorkspace } = await import('./app/Models/Workspace.js');
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (this.name === 'documentMetadata')
        throw new DOMException('Migration storage full', 'QuotaExceededError');
      return originalPut.call(this, value, ...args);
    };
    try {
      await loadWorkspace();
    } catch (error) {
      return error.message;
    } finally {
      IDBObjectStore.prototype.put = originalPut;
    }
  });
  expect(failedMigration).toContain('Migration storage full');
  const unchanged = await storedRecords(page);
  expect(unchanged.workspace).toEqual(original);
  expect(unchanged.files).toEqual([]);
  expect(unchanged.metadata).toEqual([]);
  const migrated = await page.evaluate(async () =>
    (await import('./app/Models/Workspace.js')).loadWorkspace(),
  );
  expect(migrated.workspace).toEqual(original);
  const records = await storedRecords(page);
  expect(records.version).toBe(3);
  expect(records.workspace).not.toHaveProperty('documents');
  expect(records.files).toHaveLength(2);
  await page.reload();
  expect(
    await page.evaluate(
      async () => (await (await import('./app/Models/Workspace.js')).loadWorkspace()).workspace,
    ),
  ).toEqual(original);
});

test('a temporary workspace cannot overwrite saved files after a load failure', async ({
  page,
}) => {
  const original = await page.evaluate(async () => {
    const { loadWorkspace } = await import('./app/Models/Workspace.js');
    const { workspace } = await loadWorkspace();
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('tailwind-editor');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('documentMetadata', 'readwrite');
        transaction.objectStore('documentMetadata').delete(workspace.activeId);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error);
        };
      };
    });
    return workspace;
  });
  await page.goto('./');
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await expect(page.locator('#save-status')).toHaveText('Storage unavailable');
  await page.evaluate(() =>
    window.monaco.editor.getModels()[0].setValue('<p>Temporary workspace</p>'),
  );
  await expect(
    page.frameLocator('#preview').getByText('Temporary workspace', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Control+s');
  await expect(page.locator('#save-status')).toHaveText('Not saved · download a backup');
  const records = await storedRecords(page);
  expect(records.workspace.documentIds).toEqual([original.activeId]);
  expect(records.files[0].content).toBe(original.documents[0].content);
  expect(records.metadata).toEqual([]);
});

test('transformation edits, order, and deletion persist as separate IndexedDB records', async ({
  page,
}) => {
  const initial = await page.evaluate(async () => {
    const { loadWorkspace, saveWorkspace } = await import('./app/Models/Workspace.js');
    const { workspace } = await loadWorkspace();
    workspace.transformations = ['first', 'second'].map((id) => ({
      id,
      name: id,
      code: 'return code;',
      kind: 'string',
      target: 'editor',
      mode: 'manual',
      enabled: true,
    }));
    await saveWorkspace(workspace);
    return workspace.transformations;
  });
  let records = await storedRecords(page);
  expect(records.transformations).toEqual(initial);
  expect(records.workspace.transformationIds).toEqual(['first', 'second']);
  expect(records.workspace).not.toHaveProperty('transformations');
  await instrumentWrites(page);
  const writes = await page.evaluate(async () => {
    const { loadWorkspace, saveWorkspace } = await import('./app/Models/Workspace.js');
    const { workspace } = await loadWorkspace();
    await saveWorkspace(workspace);
    const unchanged = window.storageWrites.splice(0);
    workspace.transformations[0].code = 'return code.trim();';
    await saveWorkspace(workspace);
    const edit = window.storageWrites.splice(0);
    workspace.transformations.reverse();
    await saveWorkspace(workspace);
    return { unchanged, edit, reorder: window.storageWrites.splice(0) };
  });
  expect(writes.unchanged).toEqual([]);
  expect(writes.edit).toEqual([{ store: 'transformations', id: 'first' }]);
  expect(writes.reorder).toEqual([{ store: 'workspaces', id: 'workspace' }]);
  await page.reload();
  const loaded = await page.evaluate(async () => {
    const { loadWorkspace, saveWorkspace } = await import('./app/Models/Workspace.js');
    const { workspace } = await loadWorkspace();
    const loaded = structuredClone(workspace.transformations);
    workspace.transformations.pop();
    await saveWorkspace(workspace);
    return loaded;
  });
  expect(loaded.map((item) => item.id)).toEqual(['second', 'first']);
  expect(loaded[1].code).toBe('return code.trim();');
  records = await storedRecords(page);
  expect(records.transformations).toEqual([initial[1]]);
  expect(records.workspace.transformationIds).toEqual(['second']);
});

test('schema 2 inline transformations migrate atomically and retain IDs and enabled state', async ({
  page,
}) => {
  const original = await page.evaluate(async () => {
    const { newWorkspace } = await import('./config/editor.js');
    const workspace = newWorkspace();
    workspace.transformations = [
      {
        id: 'trusted',
        name: 'Trusted transform',
        code: 'return code;',
        kind: 'string',
        target: 'editor',
        mode: 'manual',
        enabled: true,
      },
    ];
    const document = workspace.documents[0];
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(document.content),
    );
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('tailwind-editor', 2);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('workspaces');
        request.result.createObjectStore('documentFiles', { keyPath: 'id' });
        request.result.createObjectStore('documentMetadata', { keyPath: 'id' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(
          ['workspaces', 'documentFiles', 'documentMetadata'],
          'readwrite',
        );
        transaction.objectStore('documentFiles').put({
          id: document.id,
          hash,
          file: new File([document.content], document.name, { type: 'text/html;charset=utf-8' }),
        });
        const { content, ...metadata } = document;
        transaction.objectStore('documentMetadata').put(metadata);
        transaction.objectStore('workspaces').put(
          {
            version: 1,
            documentIds: [document.id],
            activeId: document.id,
            settings: workspace.settings,
            transformations: workspace.transformations,
          },
          'workspace',
        );
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error);
        };
      };
    });
    return workspace;
  });
  const failure = await page.evaluate(async () => {
    const { loadWorkspace } = await import('./app/Models/Workspace.js');
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (this.name === 'transformations')
        throw new DOMException('Transformation storage full', 'QuotaExceededError');
      return originalPut.call(this, value, ...args);
    };
    try {
      await loadWorkspace();
    } catch (error) {
      return error.message;
    } finally {
      IDBObjectStore.prototype.put = originalPut;
    }
  });
  expect(failure).toContain('Transformation storage full');
  const unchanged = await storedRecords(page);
  expect(unchanged.workspace.transformations).toEqual(original.transformations);
  expect(unchanged.transformations).toEqual([]);
  await instrumentWrites(page);
  const migrated = await page.evaluate(
    async () => (await (await import('./app/Models/Workspace.js')).loadWorkspace()).workspace,
  );
  expect(migrated).toEqual(original);
  expect(await page.evaluate(() => window.storageWrites)).toEqual([
    { store: 'transformations', id: 'trusted' },
    { store: 'workspaces', id: 'workspace' },
  ]);
  const records = await storedRecords(page);
  expect(records.transformations).toEqual(original.transformations);
  expect(records.workspace.transformationIds).toEqual(['trusted']);
  expect(records.workspace).not.toHaveProperty('transformations');
});
