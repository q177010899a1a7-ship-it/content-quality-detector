// 算法测试 - 用于验证本地检测算法的准确性

const CORE_FACTORS = {
  datePattern: /\d{4}[年./-]\d{1,2}[月./-]\d{1,2}[日]?|\d{4}年|\d+月\d+日|\d{1,2}世纪|\d{4}[./-]\d{2}/g,
  numberPattern: /\d+[岁人次名例年个%]|\d+\.\d+[%度]?|\d+万\d+千|\d+亿/g,
};

function extractKeywords(text) {
  const keywords = new Set();
  const dates = text.match(CORE_FACTORS.datePattern);
  if (dates) dates.forEach(d => keywords.add(d));
  const numbers = text.match(CORE_FACTORS.numberPattern);
  if (numbers) numbers.forEach(n => keywords.add(n));
  const chineseWords = text.match(/[一-龥]{3,}/g);
  if (chineseWords) chineseWords.forEach(w => keywords.add(w));
  const englishWords = text.match(/[a-zA-Z]{4,}/g);
  if (englishWords) englishWords.forEach(w => keywords.add(w.toLowerCase()));
  const bookTitles = text.match(/《[^》]+》/g);
  if (bookTitles) bookTitles.forEach(b => keywords.add(b));
  return Array.from(keywords);
}

function calculateCharSimilarity(t1, t2) {
  const clean1 = t1.replace(/[，。！？、；：""''《》（）\[\]【】]/g, '');
  const clean2 = t2.replace(/[，。！？、；：""''《》（）\[\]【】]/g, '');
  if (clean1 === clean2) return 1;
  if (clean1.includes(clean2) || clean2.includes(clean1)) return 0.85;
  const common = longestCommonSubstring(clean1, clean2);
  const maxLen = Math.max(clean1.length, clean2.length);
  return common.length / maxLen;
}

function longestCommonSubstring(s1, s2) {
  const m = s1.length, n = s2.length;
  let maxLen = 0, endIndex = 0;
  let short = s1, long = s2;
  if (m > n) { short = s2; long = s1; }
  const dp = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    let prev = 0;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (short[i - 1] === long[j - 1]) {
        dp[j] = prev + 1;
        if (dp[j] > maxLen) { maxLen = dp[j]; endIndex = i; }
      } else { dp[j] = 0; }
      prev = temp;
    }
  }
  return short.substring(endIndex - maxLen, endIndex);
}

function calculateSimilarity(s1, s2) {
  const kws1 = extractKeywords(s1);
  const kws2 = extractKeywords(s2);
  if (kws1.length === 0 || kws2.length === 0) return 0;
  let score = 0;
  let matchedFactors = [];
  const dateMatch = kws1.some(k => CORE_FACTORS.datePattern.test(k) && kws2.includes(k));
  if (dateMatch) { score += 0.3; matchedFactors.push('日期'); }
  const numMatch = kws1.filter(k => CORE_FACTORS.numberPattern.test(k) && kws2.includes(k));
  score += Math.min(numMatch.length * 0.08, 0.24);
  if (numMatch.length > 0) matchedFactors.push('数字');
  const bookMatch = kws1.filter(k => k.includes('《') && kws2.includes(k));
  if (bookMatch.length > 0) { score += 0.2; matchedFactors.push('作品名'); }
  const coreMatch = kws1.filter(k => k.length >= 4 && kws2.includes(k));
  score += Math.min(coreMatch.length * 0.06, 0.18);
  if (coreMatch.length > 0) matchedFactors.push('核心词');
  const charSim = calculateCharSimilarity(s1, s2);
  score += charSim * 0.25;
  const factorBonus = matchedFactors.length >= 2 ? score * 1.2 : score * 0.6;
  if (s1.length < 10 || s2.length < 10) score *= 0.5;
  return Math.min(score, 1);
}

// 测试用例
const testCases = [
  {
    name: "日期相同+核心词相同（应该高分）",
    s1: "2024年1月15日，张三在北京市参加了一场重要会议。",
    s2: "2024年1月15日，张三再次出现在北京市的活动中。",
    expect: "high"
  },
  {
    name: "只有共同词，无日期（应该低分）",
    s1: "这部电影讲述了一个人成长的故事。",
    s2: "那部电影也很好看，讲述了不同的故事。",
    expect: "low"
  },
  {
    name: "《云》电影案例（避免误报）",
    s1: "扎克·索比赫在《云》中饰演因骨肉瘤截肢的少年。",
    s2: "《云》的电影原声音乐由著名作曲家创作。",
    expect: "low"
  },
  {
    name: "简历重复自我介绍",
    s1: "张三，25岁，软件工程师，3年开发经验。",
    s2: "张三是一名软件工程师，今年25岁。",
    expect: "high"
  }
];

console.log("=== 算法测试 ===\n");

testCases.forEach((tc, i) => {
  const sim = calculateSimilarity(tc.s1, tc.s2);
  const kws1 = extractKeywords(tc.s1);
  const kws2 = extractKeywords(tc.s2);
  console.log(`测试${i + 1}: ${tc.name}`);
  console.log(`  S1关键词: ${kws1.slice(0, 5).join(', ')}`);
  console.log(`  S2关键词: ${kws2.slice(0, 5).join(', ')}`);
  console.log(`  相似度: ${(sim * 100).toFixed(1)}% (期望: ${tc.expect === 'high' ? '>=55%' : '<55%'})`);
  console.log();
});