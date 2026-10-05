export function runTransformations(code, transformations, context = {}, checkpointAfter = null) {
  if (!transformations.length) return Promise.resolve({ code, logs: [], checkpoint: code });
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./TransformationWorker.js', import.meta.url), {
      type: 'module',
    });
    let timer;
    const finish = (error, result) => {
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(error);
      else resolve(result);
    };
    timer = setTimeout(
      () =>
        finish(new Error('Transformation engine could not load in time. Check your connection.')),
      15000,
    );
    worker.onerror = (event) =>
      finish(new Error(event.message || 'Transformation engine could not load.'));
    worker.onmessage = ({ data }) => {
      if (data.ready) {
        clearTimeout(timer);
        timer = setTimeout(
          () =>
            finish(
              new Error(
                'Transformation pipeline exceeded the three-second limit. No changes were applied.',
              ),
            ),
          3000,
        );
        worker.postMessage({ code, transformations, context, checkpointAfter });
      } else if (data.error) finish(new Error(data.error));
      else finish(null, data);
    };
  });
}
