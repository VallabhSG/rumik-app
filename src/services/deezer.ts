export interface DeezerTrack {
  id: number;
  title: string;
  artist: {
    id: number;
    name: string;
    picture_medium: string;
  };
  album: {
    id: number;
    title: string;
    cover_medium: string;
  };
  preview: string;
  duration: number;
}
