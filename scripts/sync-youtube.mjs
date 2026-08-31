import { readFile, writeFile } from 'node:fs/promises';

const channelId = 'UCxWHVMzGKMIBj8seXV5UbPw';
const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
const outputPath = new URL('../videos.json', import.meta.url);

function decodeXml(value) {
    const namedEntities = {
        amp: '&', apos: "'", gt: '>', lt: '<', quot: '"'
    };

    return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (match, entity) => {
        if (entity[0] !== '#') return namedEntities[entity.toLowerCase()] ?? match;
        const hexadecimal = entity[1].toLowerCase() === 'x';
        const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    });
}

const response = await fetch(feedUrl);
if (!response.ok) throw new Error(`YouTube feed returned ${response.status}`);
const xml = await response.text();

const recentVideos = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g), match => {
    const entry = match[1];
    const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1];
    return videoId && title && published
        ? { videoId, title: decodeXml(title), published }
        : null;
}).filter(Boolean);

if (!recentVideos.length) throw new Error('YouTube feed contained no videos');

let existingVideos = [];
try {
    existingVideos = JSON.parse(await readFile(outputPath, 'utf8'));
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}

const videosById = new Map();
[...recentVideos, ...existingVideos].forEach(video => {
    if (!videosById.has(video.videoId)) videosById.set(video.videoId, video);
});

const videos = Array.from(videosById.values()).sort((a, b) =>
    new Date(b.published) - new Date(a.published)
);

await writeFile(outputPath, `${JSON.stringify(videos, null, 2)}\n`);
console.log(`Synced ${recentVideos.length} recent uploads; ${videos.length} retained in videos.json.`);
