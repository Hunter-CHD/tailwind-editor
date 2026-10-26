import {
  test,
  expect
} from '@playwright/test';

test('consumed command lines remove only their own whitespace after the handler runs', async ({
  page
}) => {
  await page.goto('./');
  const cases = [
    ['<section>\n  <!-- act: ; --> \t\n  <p>Keep</p>\n</section>', '<section>\n  <p>Keep</p>\n</section>'],
    ['<section>\r\n\t<!-- act: ; -->\r\n\t<p>Keep</p>\r\n</section>', '<section>\r\n\t<p>Keep</p>\r\n</section>'],
    ['  <!-- act: ; -->\n<p>Keep</p>', '<p>Keep</p>'],
    ['<p>Keep</p>\n  <!-- act: ; -->  ', '<p>Keep</p>\n'],
    [' \t<!-- act: ; --> ', ''],
    ['<section>\n\n  <!-- act: ; -->\n\n</section>', '<section>\n\n\n</section>'],
    ['<p>Left <!-- act: ; --> right</p>', '<p>Left  right</p>'],
    ['<p><!-- act: ; -->\nText</p>', '<p>\nText</p>'],
    ['<p>\n<!-- act: ; --></p>', '<p>\n</p>'],
    ['<!-- act: ; --><!-- other: ; -->\n<p>Keep</p>', '<!-- other: ; -->\n<p>Keep</p>'],
    ['<!-- act: ; -->\n<!-- act: ; -->\n<p>Keep</p>', '<p>Keep</p>'],
    ['<!doctype html><html><head></head><body>\n  <!-- act: ; -->\n  <p>Keep</p>\n</body></html>', '<!DOCTYPE html><html><head></head><body>\n  <p>Keep</p>\n</body></html>'],
  ];
  const results = await page.evaluate(async (inputs) => {
    const {
      runTransformations
    } = await import('./app/Services/Transformations.js');
    const output = [];
    for (const input of inputs) {
      output.push((await runTransformations(input, [{
        name: 'Act',
        kind: 'comment',
        command: 'act',
        code: ''
      }])).code);
    }
    // Handler mutations can put content on the line that would otherwise be removed.
    output.push((await runTransformations('<section>\n  <!-- act: ; -->\n</section>', [{
      name: 'Act',
      kind: 'comment',
      command: 'act',
      code: 'comment.after(document.createTextNode("Added"));',
    }])).code);
    return output;
  }, cases.map(([input]) => input));
  expect(results).toEqual([...cases.map(([, output]) => output), '<section>\n  Added\n</section>']);
});
