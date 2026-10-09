import { isObject } from "./discovery.ts";
import type { ExplorationProfile, ExplorationSpace, SpaceOwner } from "./types.ts";

export type DiscoveryFeedbackExample = { title: string; description: string; form: string; domain: string; topics: string[] };
export type DiscoveryPersonalization = {
  interests: string;
  readingList: string;
  favoriteTitles: string[];
  preferenceNotes?: string;
  mutedTopics?: string;
  feedback?: { moreTitles: string[]; lessTitles: string[]; moreKinds: string[]; lessKinds: string[];
    moreExamples?: DiscoveryFeedbackExample[]; lessExamples?: DiscoveryFeedbackExample[] };
};

// Only preferences the user expressed in this chat and the authorized reading
// list are included. Course enrollment, private records and identity are omitted.
const previousPreferenceNotes = [
  "阅读：故事和人物是主线，也欣赏文字、气氛和艺术感；可以接受故事较弱但审美出色的作品。对哲学、地域文化、社会观察、不同人的生活有兴趣。",
  "日常喜欢的入口：唱一首歌、看一个有内容的 B 站视频、看一本书或纪录片；这些是例子，不是推荐范围的边界。",
  "摄影也是明确的兴趣：从 Instagram 或 B 站发现摄影师的作品，欣赏风格、光影和构图，也可顺着作品尝试拍摄。不要把摄影默认变成相机购买、器材评测或技术课程；不推断固定摄影风格或已关注的作者。",
  "既要具体作品，也要能自己选题的活动。顺着书单可以发现相关的音乐、影像、地方文化等，不要每次都推书评或解读视频；书单不等于已经读过。",
  "保留陌生领域：音乐、游戏、运动、手工、语言、科学、设计、自然、社交等都可以尝试。活动也用来探索领域，既可接触内容，也可亲自试一个工具、玩法或技巧。不要把每一组固定成书、视频、做饭，也不要只围绕已有爱好。",
  "开放方向和具体推荐都要有操作性：指出可以开始的作品、工具、材料或玩法，保留自己选择题目与深入程度的空间。不要只说搜索相关资料或找感兴趣的内容。",
  "愿意和 AI 一起创作：让 GPT 生成脑海中的画面，或把画面转成歌词、音乐描述，再用 AI 写歌。可以创意一点，尝试不同媒介与玩法；这些也是例子，不限定为生图或写歌。",
  "看重有趣的内容或体验本身。说清一个具体吸引点，表达自然、简短；不用强迫完成、打卡、写感想、计数或照固定步骤做。",
  "不喜欢在房间找形状、硬凑观察与感悟、换标题的重复推荐。播客和博客默认不推荐；同类内容不要连续出现。",
  "喜欢自然的名字和表达，以及清晰、有美感、不过分繁复的设计；避免刻意文艺、空泛抒情和作业式口吻。",
].join("\n");
export const serenityPreferenceNotes = [
  "口味分析（依据原阅读推荐的选书理由，可被反馈修正）：故事和人物是主线，关注人的关系、选择与命运；也保留纯审美的入口，接受故事较弱但文字、气氛和艺术感很强的作品。哲学意味、地域文化、社会观察是可探索的方向，不等于喜欢每一门理论、每个民族或每本被推荐的书。",
  "探索动机（本次对话明确表达）：想接触新的领域和爱好，既欣赏作品，也愿意亲自玩、唱、拍、创作、试工具或和人交流。推荐应说清这一次能体验什么、怎样开始，不能把每个爱好都变成看介绍或做学习任务。摄影、音乐、AI 共创等有自己的吸引力，不必都绕回文学或书单。",
  ...previousPreferenceNotes.split("\n").slice(1).map((line) => line.startsWith("既要具体作品")
    ? "既要具体作品，也要能自己选题的活动。书单是依据口味分析建立的推荐结果，只是次要参考，不代表我喜欢或已读过其中每一本；不要轮流重推原书或同书解读。优先根据选书背后的故事、人物、气氛与艺术感寻找不同作者、新作品和新的体验。" : line),
].join("\n");
const previousInterests = "故事与人物、文学审美、哲学、地域文化、社会观察。也愿意唱首歌、看看视频，尝试其他陌生领域。";
const previousNotes = previousPreferenceNotes.split("\n").filter((line) => !line.startsWith("摄影也是明确的兴趣")).join("\n");

// Summarized from the user's reading list, not a claim that these books were read.
// Other accounts start with an empty profile and never inherit Serenity's tastes.
export function defaultProfile(owner: SpaceOwner): ExplorationProfile {
  return {
    preferenceVersion: 3,
    personalized: true,
    allowFeeds: false,
    preferenceNotes: owner === "serenity" ? serenityPreferenceNotes : "",
    mutedTopics: owner === "serenity" ? "天文" : "",
    interests: owner === "serenity" ? "故事与人物、文学审美、哲学、地域文化、社会观察、摄影师作品与光影。也愿意唱首歌、看看视频，尝试其他陌生领域。" : "",
    readingList: owner === "serenity" ? "《边城》《尘埃落定》《额尔古纳河右岸》《受戒》《春雪》《伊豆的舞女》《雪国》《伊甸之东》《风之影》《长日将尽》《悉达多》《地海传奇》《哲学的故事》《乡土中国》《忧郁的热带》" : "",
  };
}

export const profileFor = (space: ExplorationSpace): ExplorationProfile => {
  const saved = space.preferences.profile;
  const defaults = defaultProfile(space.owner);
  return saved ? { ...saved,
    preferenceVersion: 3,
    interests: (saved.preferenceVersion === undefined || saved.preferenceVersion === 1) && space.owner === "serenity" && saved.interests === previousInterests ? defaults.interests : saved.interests,
    preferenceNotes: saved.preferenceNotes === undefined || (saved.preferenceVersion !== 3 && space.owner === "serenity" && [previousNotes, previousPreferenceNotes].includes(saved.preferenceNotes))
      ? defaults.preferenceNotes : saved.preferenceNotes,
    mutedTopics: saved.mutedTopics ?? defaults.mutedTopics } : defaults;
};

export function parseProfile(value: unknown): ExplorationProfile | null {
  if (!isObject(value) || typeof value.personalized !== "boolean" || typeof value.allowFeeds !== "boolean" ||
    (value.preferenceVersion !== undefined && value.preferenceVersion !== 1 && value.preferenceVersion !== 2 && value.preferenceVersion !== 3) ||
    typeof value.interests !== "string" || value.interests.length > 1000 ||
    typeof value.readingList !== "string" || value.readingList.length > 2400 ||
    (value.preferenceNotes !== undefined && (typeof value.preferenceNotes !== "string" || value.preferenceNotes.length > 2000)) ||
    (value.mutedTopics !== undefined && (typeof value.mutedTopics !== "string" || value.mutedTopics.length > 240))) return null;
  return { personalized: value.personalized, allowFeeds: value.allowFeeds, interests: value.interests.trim(), readingList: value.readingList.trim(),
    ...(value.preferenceVersion ? { preferenceVersion: value.preferenceVersion as 1 | 2 | 3 } : {}),
    ...(typeof value.preferenceNotes === "string" ? { preferenceNotes: value.preferenceNotes.trim() } : {}),
    ...(typeof value.mutedTopics === "string" ? { mutedTopics: value.mutedTopics.trim() } : {}) };
}

export function parsePersonalization(value: unknown): DiscoveryPersonalization | null {
  if (!isObject(value) || typeof value.interests !== "string" || value.interests.length > 1000 ||
    typeof value.readingList !== "string" || value.readingList.length > 2400 ||
    !Array.isArray(value.favoriteTitles) || value.favoriteTitles.length > 12 ||
    !value.favoriteTitles.every((title) => typeof title === "string" && title.length <= 160) ||
    (value.preferenceNotes !== undefined && (typeof value.preferenceNotes !== "string" || value.preferenceNotes.length > 2000)) ||
    (value.mutedTopics !== undefined && (typeof value.mutedTopics !== "string" || value.mutedTopics.length > 240))) return null;
  const feedback = value.feedback;
  if (feedback !== undefined && (!isObject(feedback) ||
    !["moreTitles", "lessTitles", "moreKinds", "lessKinds"].every((key) => Array.isArray(feedback[key]) && feedback[key].length <= 12 &&
      feedback[key].every((item) => typeof item === "string" && item.length <= (key.endsWith("Titles") ? 160 : 60))))) return null;
  const exampleList = (value: unknown) => value === undefined || (Array.isArray(value) && value.length <= 12 && value.every((item) =>
    isObject(item) && typeof item.title === "string" && item.title.length <= 160 &&
    typeof item.description === "string" && item.description.length <= 220 && typeof item.form === "string" && item.form.length <= 60 &&
    typeof item.domain === "string" && item.domain.length <= 60 && Array.isArray(item.topics) && item.topics.length <= 24 &&
    item.topics.every((topic) => typeof topic === "string" && topic.length <= 60)));
  if (isObject(feedback) && (!exampleList(feedback.moreExamples) || !exampleList(feedback.lessExamples))) return null;
  const examples = (value: unknown) => (value as DiscoveryFeedbackExample[]).map((item) => ({ ...item, topics: [...item.topics] }));
  return { interests: value.interests.trim(), readingList: value.readingList.trim(), favoriteTitles: [...value.favoriteTitles],
    ...(typeof value.preferenceNotes === "string" ? { preferenceNotes: value.preferenceNotes.trim() } : {}),
    ...(typeof value.mutedTopics === "string" ? { mutedTopics: value.mutedTopics.trim() } : {}),
    ...(feedback ? { feedback: {
      moreTitles: [...(feedback.moreTitles as string[])], lessTitles: [...(feedback.lessTitles as string[])],
      moreKinds: [...(feedback.moreKinds as string[])], lessKinds: [...(feedback.lessKinds as string[])],
      ...(feedback.moreExamples ? { moreExamples: examples(feedback.moreExamples) } : {}),
      ...(feedback.lessExamples ? { lessExamples: examples(feedback.lessExamples) } : {}),
    } } : {}) };
}

export function readingReferences(profile?: DiscoveryPersonalization): string[] {
  if (!profile) return [];
  const titles = [...profile.readingList.matchAll(/《([^》]{1,100})》/g)].map((match) => match[1]);
  return titles.length ? [...new Set(titles)] : profile.readingList.split(/[\n、，,；;]/).map((value) => value.trim()).filter(Boolean).slice(0, 30);
}
