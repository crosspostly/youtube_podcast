
export interface Source {
  uri: string;
  title: string;
}

export interface PodcastPackage {
  title: string;
  description: string;
  seoKeywords: string[];
  script: { type: string; text: string }[];
  imagePrompts: string[];
  sources: Source[];
  audio: string | null;
}