import { useRef, useEffect } from 'react';

export function PdfThumbnail({ pdfDoc, pageNum }) {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);

  useEffect(() => {
    if (!pdfDoc) return;
    let isMounted = true;

    const renderThumb = async () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {}
        renderTaskRef.current = null;
      }

      try {
        const page = await pdfDoc.getPage(pageNum);
        const canvas = canvasRef.current;
        if (!canvas || !isMounted) return;

        const context = canvas.getContext('2d');
        const viewport = page.getViewport({ scale: 0.2 });

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        context.clearRect(0, 0, canvas.width, canvas.height);

        const renderTask = page.render({
          canvasContext: context,
          viewport: viewport,
        });

        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('Thumbnail render error:', err);
        }
      } finally {
        renderTaskRef.current = null;
      }
    };

    renderThumb();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {}
      }
    };
  }, [pdfDoc, pageNum]);

  return (
    <div className="page-card-thumb">
      <canvas ref={canvasRef} />
    </div>
  );
}
