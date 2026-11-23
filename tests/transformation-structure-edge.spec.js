import {
  test,
  expect
} from '@playwright/test';

test('implicit captures cannot be placed in void elements', async ({
  page
}) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const {
      runTransformations
    } = await import('./app/Services/Transformations.js');
    return runTransformations('<p>Keep</p>', [{
      name: 'Void capture',
      kind: 'dom',
      code: `
      const original = document.querySelector('p');
      const before = document.toString();
      for (const expression of ['img', 'section>input']) {
        try {
          await api.structure.wrap([original], expression);
          throw new Error('Accepted void destination');
        } catch (error) { if (!error.message.includes('cannot receive a capture')) throw error; }
      }
      if (document.toString() !== before || document.querySelector('p') !== original) throw new Error('Lost capture');
    `
    }]);
  });
  expect(result.code).toBe('<p>Keep</p>');
});

test('aggregate output limits also apply when all captures are unused', async ({
  page
}) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const {
      runTransformations
    } = await import('./app/Services/Transformations.js');
    return runTransformations('<h3>One</h3><h3>Two</h3><h3>Three</h3><h3>Four</h3><h3>Five</h3>', [{
      name: 'Unused capture budget',
      kind: 'dom',
      code: `
      const template = await api.structure.parse('div*5000');
      const before = document.toString();
      try {
        api.structure.plan({ roots: [...document.body.children], captures: 'h3', template });
        throw new Error('Accepted excessive aggregate output');
      } catch (error) { if (!error.message.includes('output node budget exceeded')) throw error; }
      if (document.toString() !== before) throw new Error('Changed source');
    `
    }]);
  });
  expect(result.code).not.toContain('<div');
});

test('identical replacement of a captured descendant makes its plan stale', async ({
  page
}) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const {
      runTransformations
    } = await import('./app/Services/Transformations.js');
    return runTransformations('<h3><em>Title</em></h3>', [{
      name: 'Descendant identity',
      kind: 'dom',
      code: `
      const template = await api.structure.parse('section>@1*2');
      const plan = api.structure.plan({ roots: [...document.body.children], captures: 'h3', template });
      const heading = document.querySelector('h3');
      heading.innerHTML = heading.innerHTML;
      try { api.structure.apply(plan); throw new Error('Accepted replaced descendant'); }
      catch (error) { if (!error.message.includes('stale')) throw error; }
    `
    }]);
  });
  expect(result.code).toBe('<h3><em>Title</em></h3>');
});

test('implicit wrapping targets the surviving resolved leaf after zero-repeat pruning', async ({
  page
}) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const {
      runTransformations
    } = await import('./app/Services/Transformations.js');
    return runTransformations('<main><p>Keep</p></main>', [{
      name: 'Resolved insertion',
      kind: 'dom',
      code: `
      const original = document.querySelector('p');
      await api.structure.wrap([original], 'article>(div+aside*0)', { format: false });
      if (document.querySelector('article div p') !== original) throw new Error('Lost range placement');
    `
    }]);
  });
  expect(result.code).toBe('<main><article><div><p>Keep</p></div></article></main>');
});

test('nested repetition is bounded before expansion and a failed expression does not mutate source', async ({
  page
}) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const {
      runTransformations
    } = await import('./app/Services/Transformations.js');
    return runTransformations('<p>Keep</p>', [{
      name: 'Budget',
      kind: 'dom',
      code: `
      const before = document.toString();
      for (const expression of ['(div*100)*100', 'div>'.repeat(66) + 'p']) {
        let failed = false;
        try { await api.structure.parse(expression); } catch (error) {
          if (!/budget|depth/.test(error.message)) throw error;
          failed = true;
        }
        if (!failed) throw new Error('Accepted excessive expansion');
      }
      if (document.toString() !== before) throw new Error('Mutated document');
    `
    }]);
  });
  expect(result.code).toBe('<p>Keep</p>');
});
