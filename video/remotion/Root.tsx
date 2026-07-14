import { Composition } from "remotion";
import { ExplainerVideo } from "./compositions/ExplainerVideo";
import { videoRenderPropsSchema, type VideoRenderProps } from "../types/video-types";

const defaultProps: VideoRenderProps = {
  width: 1920,
  height: 1080,
  fps: 30,
  generatedDate: "Nuxton Knowledge Platform",
  script: {
    version: "1.0",
    title: "Radar IA",
    language: "es-ES",
    estimatedDurationSeconds: 20,
    introduction: { narration: "Resumen de novedades de inteligencia artificial.", onScreenTitle: "Radar IA" },
    scenes: [
      {
        id: "scene-1",
        newsItemId: "preview",
        order: 1,
        title: "Novedad destacada",
        narration: "Contenido de previsualizacion para la composicion de video.",
        onScreenBullets: ["Informacion relevante"],
        sourceLabel: "Fuente",
        estimatedDurationSeconds: 5
      }
    ],
    conclusion: {
      narration: "Revision completada con las acciones recomendadas.",
      onScreenTitle: "Siguiente paso",
      onScreenBullets: ["Revisar y priorizar"]
    },
    sources: [{ newsItemId: "preview", name: "Fuente", title: "Novedad destacada" }]
  },
  timeline: {
    version: "1.0",
    fps: 30,
    totalDurationSeconds: 10,
    captions: [],
    segments: [
      { id: "intro", kind: "intro", startSeconds: 0, durationSeconds: 3, title: "Radar IA", bullets: [] },
      { id: "sources", kind: "sources", startSeconds: 3, durationSeconds: 7, title: "Fuentes", bullets: [] }
    ]
  }
};

export function RemotionRoot() {
  return (
    <Composition
      id="ExplainerVideo"
      component={ExplainerVideo}
      schema={videoRenderPropsSchema}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, Math.ceil(props.timeline.totalDurationSeconds * props.fps)),
        fps: props.fps,
        width: props.width,
        height: props.height
      })}
    />
  );
}
