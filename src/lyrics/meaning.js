import { normalizeArabic, splitWords } from './lyrics.js';

// قاموس دلالي: كلمات (بعد التطبيع) ← مشهد. يطابق الكلمة كاملة أو بعد حذف السوابق (ال، و، ف، ب، ل، ك) واللواحق الشائعة.
export const SCENE_KEYWORDS = {
  eyes: ['عين', 'عيون', 'عيني', 'عيوني', 'عيونك', 'عينك', 'شفت', 'شفتك', 'شاف', 'شافت', 'اشوف', 'تشوف', 'شوف', 'نظر', 'نظره', 'نظرات', 'لمحت', 'رمش', 'رموش', 'نظرتك', 'شوفتك'],
  talk: ['كلام', 'كلامك', 'كلامي', 'حكي', 'حكيت', 'احكي', 'تحكي', 'قال', 'قالو', 'قلت', 'قلتلك', 'تقول', 'يقول', 'سوالف', 'سالفه', 'حديث', 'كلمه', 'كلمات', 'حرف', 'همس', 'صوت', 'صوتك', 'سمعت', 'اسمع', 'تسمع', 'سؤال', 'جواب', 'ردي', 'رد'],
  phone: ['رساله', 'رسايل', 'رسالتك', 'جوال', 'تلفون', 'اتصال', 'اتصل', 'مكالمه', 'موبايل', 'شاشه', 'رقم', 'رقمك'],
  night: ['ليل', 'ليله', 'ليالي', 'الليل', 'قمر', 'نجم', 'نجوم', 'سهر', 'سهران', 'سهرت', 'نوم', 'نمت', 'حلم', 'احلام', 'حلمت', 'ظلام'],
  sea: ['بحر', 'بحور', 'موج', 'امواج', 'شط', 'شاطي', 'مركب', 'سفينه', 'غرق', 'غرقت', 'مينا'],
  rain: ['مطر', 'دمع', 'دموع', 'دمعه', 'بكا', 'بكي', 'ابكي', 'بكيت', 'حزن', 'حزين', 'غيم', 'شتا', 'جرح', 'جروح', 'الم'],
  road: ['طريق', 'درب', 'سفر', 'مسافر', 'سافرت', 'رحت', 'راح', 'روح', 'رجع', 'ارجع', 'رجعت', 'بعيد', 'غياب', 'غبت', 'مشيت', 'خطوه', 'خطوات', 'وداع', 'فراق', 'رحيل'],
  heart: ['قلب', 'قلبي', 'قلبك', 'حب', 'حبك', 'حبي', 'حبيب', 'حبيبي', 'غرام', 'عشق', 'عشقت', 'هوى', 'هواك', 'شوق', 'اشتقت', 'ورد', 'ورده', 'زهر', 'حنين', 'غالي', 'روحي'],
  city: ['ناس', 'الناس', 'مدينه', 'شارع', 'كلهم', 'عالم', 'دنيا', 'بلد', 'حاره', 'جيران', 'غريب'],
  stage: ['غني', 'غنيت', 'اغنيه', 'اغاني', 'غنا', 'طرب', 'رقص', 'ارقص', 'لحن', 'عود', 'موسيقى', 'مسرح', 'صفق'],
  clock: ['وقت', 'ساعه', 'زمن', 'زمان', 'عمر', 'عمري', 'انتظر', 'انتظار', 'استنى', 'يوم', 'ايام', 'سنين', 'سنه', 'لحظه', 'دقيقه', 'بكره', 'امس', 'ماضي'],
  desert: ['صحرا', 'صحراء', 'رمل', 'غربه', 'وحدي', 'وحيد', 'وحده', 'تعب', 'تعبت', 'عطش', 'سراب', 'ضعت', 'ضايع'],
  fire: ['نار', 'حرق', 'حرقت', 'جمر', 'غضب', 'زعل', 'زعلان', 'ولعت', 'لهيب', 'كذب', 'كذاب', 'غدر'],
  sunrise: ['صبح', 'صباح', 'شمس', 'نهار', 'امل', 'ضحكه', 'ضحكت', 'فرح', 'فرحه', 'نور', 'بسمه', 'حياه', 'جديد'],
};

export const SCENE_NAMES = {
  intro: 'مقدمة (عنوان الأغنية)',
  eyes: 'العيون والنظرات',
  talk: 'حوار وكلام في المقهى',
  phone: 'رسائل على الهاتف',
  night: 'ليل وقمر ونجوم',
  sea: 'بحر وقارب',
  rain: 'مطر خلف النافذة',
  road: 'طريق وسفر بالسيارة',
  heart: 'قلوب وحديقة',
  city: 'مدينة وناس',
  stage: 'مسرح وغناء',
  clock: 'الوقت والساعة',
  desert: 'صحراء ووحدة',
  fire: 'نار وجمر',
  sunrise: 'شروق وأمل',
  interlude: 'فاصل موسيقي (رقص)',
  outro: 'خاتمة',
};

export const LYRIC_SCENES = Object.keys(SCENE_KEYWORDS);
const FALLBACK_ORDER = ['city', 'stage', 'night', 'road', 'sunrise', 'sea', 'heart', 'clock', 'talk', 'desert', 'rain', 'phone', 'fire', 'eyes'];

const PREFIXES = ['وال', 'بال', 'فال', 'كال', 'لل', 'ال', 'و', 'ف', 'ب', 'ل', 'ك'];
const SUFFIXES = ['هم', 'كم', 'نا', 'ها', 'ك', 'ي', 'ه', 'ت'];

function variants(word) {
  const out = new Set([word]);
  // السوابق قد تتراكب (و + بال + ليل) فنطبقها مرتين
  for (let pass = 0; pass < 2; pass++) for (const v of [...out]) for (const p of PREFIXES) if (v.startsWith(p) && v.length - p.length >= 2) out.add(v.slice(p.length));
  for (const v of [...out]) for (const s of SUFFIXES) if (v.endsWith(s) && v.length - s.length >= 2) out.add(v.slice(0, -s.length));
  return [...out];
}

const INDEX = new Map();
for (const [scene, words] of Object.entries(SCENE_KEYWORDS)) for (const w of words) if (!INDEX.has(w)) INDEX.set(w, scene);

// يعيد جميع المطابقات في السطر بترتيب ظهورها
export function sceneMatches(text) {
  const out = [];
  for (const raw of splitWords(text)) {
    const n = normalizeArabic(raw);
    for (const v of variants(n)) {
      const sc = INDEX.get(v);
      if (sc) { out.push({ scene: sc, word: raw }); break; }
    }
  }
  return out;
}

// اقتراح مشاهد لكل الأسطر مع منع تكرار المشهد نفسه في سطرين متتاليين حين يوجد بديل
export function suggestScenes(lines) {
  const used = new Map();
  let prev = null;
  return lines.map((l) => {
    const m = sceneMatches(l.text);
    let pick = m.find((x) => x.scene !== prev) || null;
    let reason;
    if (pick) reason = `الكلمة «${pick.word}»`;
    else {
      const sc = [...FALLBACK_ORDER].sort((a, b) => (used.get(a) || 0) - (used.get(b) || 0)).find((s) => s !== prev);
      pick = { scene: sc };
      reason = m.length ? `تجنّب تكرار المشهد السابق` : 'لا توجد كلمة دالّة — مشهد متنوّع (عدّله حسب المعنى)';
    }
    used.set(pick.scene, (used.get(pick.scene) || 0) + 1);
    prev = pick.scene;
    return { scene: pick.scene, reason };
  });
}
