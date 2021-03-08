import { sceneCollection } from "../../database";
import { FFProbeContainers } from "../../ffmpeg/ffprobe";
import { SceneStreamTypes } from "../../routers/scene";
import Actor from "../../types/actor";
import CustomField, { CustomFieldTarget } from "../../types/custom_field";
import Image from "../../types/image";
import Label from "../../types/label";
import Marker from "../../types/marker";
import Movie from "../../types/movie";
import Scene from "../../types/scene";
import Studio from "../../types/studio";
import SceneView from "../../types/watch";
import { handleError, logger } from "../../utils/logger";
import { getExtension } from "../../utils/string";
import { videoIsValidForContainer } from "./../../ffmpeg/ffprobe";

interface AvailableStreams {
  label: string;
  mimeType?: string;
  streamType: SceneStreamTypes;
  transcode: boolean;
}

export default {
  async actors(scene: Scene): Promise<Actor[]> {
    return await Scene.getActors(scene);
  },
  async images(scene: Scene): Promise<Image[]> {
    return await Image.getByScene(scene._id);
  },
  async labels(scene: Scene): Promise<Label[]> {
    return await Scene.getLabels(scene);
  },
  async thumbnail(scene: Scene): Promise<Image | null> {
    if (scene.thumbnail) return await Image.getById(scene.thumbnail);
    return null;
  },
  async preview(scene: Scene): Promise<Image | null> {
    if (scene.preview) return await Image.getById(scene.preview);
    return null;
  },
  async studio(scene: Scene): Promise<Studio | null> {
    if (scene.studio) return Studio.getById(scene.studio);
    return null;
  },
  async markers(scene: Scene): Promise<Marker[]> {
    return await Scene.getMarkers(scene);
  },
  async availableFields(): Promise<CustomField[]> {
    const fields = await CustomField.getAll();
    return fields.filter((field) => field.target.includes(CustomFieldTarget.SCENES));
  },
  async movies(scene: Scene): Promise<Movie[]> {
    return Scene.getMovies(scene);
  },
  async watches(scene: Scene): Promise<number[]> {
    return (await SceneView.getByScene(scene._id)).map((v) => v.date);
  },
  async availableStreams(scene: Scene): Promise<AvailableStreams[]> {
    if (!scene.path) {
      return [];
    }

    if (!scene.meta.container || !scene.meta.videoCodec) {
      logger.verbose(
        `Scene ${scene._id} doesn't have codec information to determine available streams, running ffprobe`
      );
      await Scene.runFFProbe(scene);
      sceneCollection.upsert(scene._id, scene).catch((err) => {
        handleError("Failed to update scene after updating codec information", err);
      });
    }

    const streams: AvailableStreams[] = [];

    // Attempt direct stream, set it as first item
    streams.unshift({
      label: "direct play",
      mimeType:
        // Attempt to trick the browser into playing mkv by using the mp4 mime type
        // Otherwise let the browser handle the unknown mime type
        [".mp4", ".mkv"].includes(getExtension(scene.path)) ? "video/mp4" : undefined,
      streamType: SceneStreamTypes.DIRECT,
      transcode: false,
    });

    // Mkv might contain mp4 compatible streams
    if (
      scene.meta.container === FFProbeContainers.MKV &&
      scene.meta.videoCodec &&
      videoIsValidForContainer(FFProbeContainers.MP4, scene.meta.videoCodec)
    ) {
      streams.push({
        label: "mkv direct stream",
        mimeType: "video/mp4",
        streamType: SceneStreamTypes.MP4,
        transcode: true,
      });
    }

    // Fallback transcode: webm
    streams.push({
      label: "webm transcode",
      mimeType: "video/webm",
      streamType: SceneStreamTypes.WEBM,
      transcode: true,
    });

    // Otherwise video cannot be streamed

    return streams;
  },
};
