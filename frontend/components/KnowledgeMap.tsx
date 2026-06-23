"use client";

import { useEffect, useRef, useState } from "react";
import { CompileResult } from "@/lib/api";

interface KnowledgeMapProps {
  compileResult: CompileResult;
}

export default function KnowledgeMap({ compileResult }: KnowledgeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 800, h: 500 });

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !compileResult) return;

    let cancelled = false;

    const renderMap = async () => {
      try {
        const { Transformer } = await import("markmap-lib");
        const { Markmap } = await import("markmap-view");

        if (cancelled || !svgRef.current || !containerRef.current) return;

        // Get container pixel dimensions
        const rect = containerRef.current.getBoundingClientRect();
        const w = Math.max(rect.width || containerRef.current.clientWidth || 800, 200);
        const h = Math.max(rect.height || containerRef.current.clientHeight || 500, 200);

        if (rect.width < 50 || rect.height < 50) {
          const retries = (window as any).__markmapRetries || 0;
          if (retries < 15) {
            (window as any).__markmapRetries = retries + 1;
            setTimeout(() => { if (!cancelled) renderMap(); }, 200);
          } else {
            setError('思维导图容器尺寸异常，请刷新页面');
          }
          return;
        }
        (window as any).__markmapRetries = 0;

        // Set explicit pixel dimensions on SVG (required by markmap)
        setDims({ w, h });
        svgRef.current.setAttribute("width", String(w));
        svgRef.current.setAttribute("height", String(h));
        svgRef.current.style.width = w + "px";
        svgRef.current.style.height = h + "px";

        // Build markdown from compile result
        const lines: string[] = [];
        lines.push(`# ${compileResult.video.title}`);

        for (const concept of compileResult.concepts) {
          lines.push(`## ${concept.name}`);
          if (concept.definition) {
            lines.push(`- _${concept.definition}_`);
          }
          for (const claim of concept.claims) {
            lines.push(`- ${claim.statement} [${claim.time}]`);
          }
        }

        const markdown = lines.join("\n");
        const transformer = new Transformer();
        const { root } = transformer.transform(markdown);

        // Clear existing content
        while (svgRef.current.firstChild) {
          svgRef.current.removeChild(svgRef.current.firstChild);
        }

        Markmap.create(svgRef.current, {
          color: (node: any) => {
            const depth = node.depth || 0;
            const colors = ["#059669", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"];
            return colors[depth % colors.length];
          },
          paddingX: 16,
          autoFit: true,
        }, root);
        setLoaded(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render mind map");
        }
      }
    };

    renderMap();

    return () => {
      cancelled = true;
    };
  }, [compileResult]);

  if (error) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)" }}>
        <p>思维导图加载失败: {error}</p>
      </div>
    );
  }

  return (
    <div className="markmap-container" ref={containerRef}>
      {!loaded && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--text-tertiary)",
          fontSize: 13,
        }}>
          加载思维导图...
        </div>
      )}
      <svg
        ref={svgRef}
        width={dims.w}
        height={dims.h}
        style={{ display: loaded ? "block" : "none" }}
      />
    </div>
  );
}
