import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { VideoRenderProps } from "../../types/video-types";
import { Captions } from "../components/Captions";
import { FinalSummary } from "../components/FinalSummary";
import { InformationScene } from "../components/InformationScene";
import { ProgressIndicator } from "../components/ProgressIndicator";
import { SourcesScreen } from "../components/SourcesScreen";
import { VideoCover } from "../components/VideoCover";

export function ExplainerVideo({ script, timeline, generatedDate }: VideoRenderProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const currentSeconds = frame / fps;
  const caption = timeline.captions.find(
    (cue) => currentSeconds >= cue.startSeconds && currentSeconds < cue.endSeconds
  );
  const newsSegments = timeline.segments.filter((segment) => segment.kind === "news");

  return (
    <AbsoluteFill style={{ fontFamily: "Arial, Helvetica, sans-serif", backgroundColor: "#f4f7f5", overflow: "hidden" }}>
      <div style={{ width: 1920, height: 1080, position: "relative", transform: `scale(${width / 1920}, ${height / 1080})`, transformOrigin: "top left" }}>
      {timeline.segments.map((segment) => {
        const from = Math.round(segment.startSeconds * fps);
        const durationInFrames = Math.max(1, Math.round(segment.durationSeconds * fps));
        const newsIndex = newsSegments.findIndex((entry) => entry.id === segment.id);
        return (
          <Sequence key={segment.id} from={from} durationInFrames={durationInFrames} premountFor={fps}>
            {segment.kind === "intro" ? (
              <VideoCover title={script.title} subtitle={script.subtitle} date={generatedDate} />
            ) : null}
            {segment.kind === "news" ? (
              <InformationScene
                title={segment.title}
                bullets={segment.bullets}
                sourceLabel={segment.sourceLabel}
                imageFile={segment.imageFile}
                index={newsIndex + 1}
                total={newsSegments.length}
              />
            ) : null}
            {segment.kind === "conclusion" ? (
              <FinalSummary title={segment.title} bullets={segment.bullets} />
            ) : null}
            {segment.kind === "sources" ? <SourcesScreen sources={script.sources} /> : null}
            <ProgressIndicator startFrame={from} total={Math.round(timeline.totalDurationSeconds * fps)} />
            {segment.audioFile ? <Audio src={staticFile(segment.audioFile)} /> : null}
          </Sequence>
        );
      })}
      <Captions text={caption?.text} />
      </div>
    </AbsoluteFill>
  );
}
