// Links to video sites, whose recipes are read from the video (YouTube, TikTok, Instagram).
const VIDEO_SITE: [RegExp, string][] = [[/(^|\.)(youtube\.com|youtu\.be)$/i, 'YouTube'], [/(^|\.)tiktok\.com$/i, 'TikTok'], [/(^|\.)(instagram\.com|instagr\.am)$/i, 'Instagram']]

/** The video site's name ("YouTube") for a link to one, else undefined. */
export const videoSite = (link: string) => { try { const h = new URL(link).hostname; return VIDEO_SITE.find(([re]) => re.test(h))?.[1] } catch { return undefined } }
