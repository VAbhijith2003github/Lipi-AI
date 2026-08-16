import { useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

export function PdfPageRender({ pdfDoc, pageNum, zoomFactor, containerWidth, onPageVisible, setCalculatedScale, searchQuery }) {
  const canvasRef = useRef(null);
  const pageRef = useRef(null);
  const renderTaskRef = useRef(null);

  useEffect(() => {
    if (!pdfDoc) return;
    let isMounted = true;

    const renderPage = async () => {
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
        const availableWidth = Math.max(280, (containerWidth || 800) - 40);
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const fitWidthScale = availableWidth / unscaledViewport.width;
        const effectiveScale = fitWidthScale * zoomFactor;

        if (pageNum === 1 && setCalculatedScale) {
          setCalculatedScale(effectiveScale);
        }

        const viewport = page.getViewport({ scale: effectiveScale });
        const outputScale = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.clearRect(0, 0, canvas.width, canvas.height);

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          transform: transform,
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;
        await renderTask.promise;

        // ---- Text Highlight Overlay for Keyword Search ----
        if (searchQuery && searchQuery.trim() && isMounted) {
          const searchLower = searchQuery.trim().toLowerCase();
          try {
            const textContent = await page.getTextContent();
            context.save();
            if (outputScale !== 1) {
              context.scale(outputScale, outputScale);
            }

            context.fillStyle = 'rgba(255, 235, 59, 0.55)'; // Clean translucent yellow highlight

            for (const item of textContent.items) {
              if (!item.str || !item.str.toLowerCase().includes(searchLower)) continue;

              const itemStr = item.str;
              const itemStrLower = itemStr.toLowerCase();
              const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
              const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
              const baseX = tx[4];
              const y = tx[5] - fontHeight * 0.95;
              const totalWidth = item.width * viewport.scale;
              const height = fontHeight * 1.15;

              context.font = `${Math.round(fontHeight)}px sans-serif`;

              let startIndex = 0;
              while (true) {
                const matchIndex = itemStrLower.indexOf(searchLower, startIndex);
                if (matchIndex === -1) break;

                const prefixText = itemStr.substring(0, matchIndex);
                const matchText = itemStr.substring(matchIndex, matchIndex + searchLower.length);

                const measuredPrefix = context.measureText(prefixText).width;
                const measuredMatch = context.measureText(matchText).width;
                const measuredTotal = context.measureText(itemStr).width;

                const scaleFactor = measuredTotal > 0 ? totalWidth / measuredTotal : 1;

                const xOffset = measuredPrefix * scaleFactor;
                const matchWidth = measuredMatch * scaleFactor;
                const highlightX = baseX + xOffset;

                context.fillRect(highlightX, y, matchWidth, height);

                startIndex = matchIndex + searchLower.length;
              }
            }
            context.restore();
          } catch (highlightErr) {
            console.error("Text highlight error:", highlightErr);
          }
        }
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error(`Page ${pageNum} render error:`, err);
        }
      } finally {
        renderTaskRef.current = null;
      }
    };

    renderPage();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {}
      }
    };
  }, [pdfDoc, pageNum, zoomFactor, containerWidth, setCalculatedScale, searchQuery]);

  // Observer to track which page is currently visible as user scrolls
  useEffect(() => {
    const element = pageRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (let entry of entries) {
          if (entry.isIntersecting) {
            onPageVisible(pageNum);
          }
        }
      },
      { threshold: 0.35 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [pageNum, onPageVisible]);

  return (
    <div id={`pdf-page-${pageNum}`} ref={pageRef} className="pdf-page-wrapper">
      <canvas ref={canvasRef} />
    </div>
  );
}
