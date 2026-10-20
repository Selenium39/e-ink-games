// 土耳其语消息字典。结构须与 en.ts 逐键对齐（见 Messages 类型约束）；
// 缺键时 t() 自动回退英文。称谓用非正式 sen（游戏产品惯例），
// 术语对齐姊妹站 e-ink.me 土耳其语词表（Dil seçin / Web'den EPUB'a / e-okuyucu）。
// 注意土耳其语 İ/i 大小写特殊性（大写 i 带点为 İ，小写 ı 不带点）。

import type { Messages } from "./en";

const tr: Messages = {
  site: {
    chrome: {
      brand: "E-Ink Games",
      tagline: "E-okuyucular için ücretsiz tarayıcı oyunları",
      skipToContent: "İçeriğe atla",
      nav: {
        label: "Site gezinmesi",
        games: "Oyunlar",
        about: "Hakkında",
      },
      language: {
        label: "Dil seçin",
      },
      footer: {
        family: "E-Ink.me ailesinin bir parçası",
        familyCta: "Web'den EPUB'a, e-okuyucu araçları",
        news: "E-Ink News",
        rights: "Reklam yok. Ağır takip betikleri yok. Sadece ekranına saygı duyan oyunlar.",
      },
    },
    home: {
      title: "Kindle ve E-Ink okuyucular için ücretsiz oyunlar — tarayıcında oyna",
      description:
        "Ücretsiz oyunları doğrudan Kindle ya da e-mürekkep tabletinin tarayıcısında oyna: Sudoku, Minesweeper, 2048 ve daha fazlası. İndirme yok, kurulum yok — e-mürekkep ekranlar için tasarlandı.",
      h1: "Kindle ve E-Ink okuyucular için ücretsiz oyunlar — tarayıcında oyna",
      intro:
        "E-mürekkep ekranlar için tasarlanmış ücretsiz tarayıcı oyunları: saf siyah beyaz, sıfır animasyon, sıfır titreme. Bu siteyi Kindle, BOOX, Kobo veya herhangi bir e-mürekkep cihazının tarayıcısında aç ve oynamaya başla — kurulacak hiçbir şey yok.",
      catalogEyebrow: "Oyun Kataloğu",
      catalogPlaceholder:
        "Oyun kataloğu şu an hazırlanıyor. İlk sırada Sudoku var — yakında tekrar uğra.",
    },
    about: {
      title: "Hakkında — E-Ink Games",
      h1: "E-Ink Games Hakkında",
      intro:
        "E-Ink Games, e-mürekkepte kendini evinde hisseden tarayıcı oyunlarını bir araya getirir: yüksek kontrast, hareket yok, numara yok — sadece ekranına ve pillerine saygı duyan oyunlar.",
      // 占位：导流主站段落，内容由后续 about 内容任务填充。
      familyTitle: "E-Ink.me Ailesi",
      familyCta: "Web'den EPUB'a, e-okuyucu araçları",
      familyPlaceholder:
        "Oyunlar, hikâyenin yalnızca yarısı. E-Ink.me ailesi, tüm e-okuyucu hayatın için araçlar geliştirir — herhangi bir web makalesini Kindle'ın için EPUB'a dönüştürür ve daha fazlasını yapar.",
    },
  },
  games: {
    // 游戏页模板公共词（规约 §8.1；原 page.tsx 内 TEMPLATE_WORDS 收编于此）
    common: {
      category: {
        puzzle: "Bulmaca",
        word: "Kelime",
        board: "Masa oyunu",
        logic: "Mantık",
        daily: "Günlük",
      },
      // 按分类拆键（t() 无插值参数）；标题视觉沿用旧拼接的小写形态
      moreGames: {
        puzzle: "Daha fazla bulmaca oyunu",
        word: "Daha fazla kelime oyunu",
        board: "Daha fazla masa oyunu",
        logic: "Daha fazla mantık oyunu",
        daily: "Daha fazla günlük oyun",
      },
      howToPlay: "Nasıl oynanır",
      devices: "Cihaz uyumluluğu",
      colDevice: "Cihaz",
      colStatus: "Durum",
      colNote: "Notlar",
      statusYes: "Çalışıyor",
      statusLimited: "Sınırlı",
      statusNo: "Desteklenmiyor",
      whyEInk: "E-mürekkepte neden çalışıyor",
      faq: "Sıkça sorulan sorular",
      relatedEmpty:
        "Bu kategorideki daha fazla oyun şu anda hazırlanıyor — katalog oyun oyun büyüyor. Bu arada, tarayıcında şu anda çalışan her şeye göz at.",
      browseAll: "Tüm oyunlara göz at",
      // GameShell 壳层四词（加载状态语义拆分见 GameShell.tsx 文件头注释）
      shellLoading: "Yükleniyor…",
      shellError: "Oyun yüklenemedi — yeniden denemek için sayfayı yenile.",
      shellFallback: "Bu oyun daha yeni bir tarayıcı gerektiriyor.",
      shellNoscript: "Bu oyun tamamen tarayıcında çalışır — oynamak için lütfen JavaScript'i etkinleştir.",
    },
    // 首页目录区公共词（原 [locale]/page.tsx 内 HOME_WORDS 收编于此）
    home: {
      playCta: "Ücretsiz oyna",
      categories: "Kategoriye göre göz at",
      gameCount: "oyun",
      comingSoon: "Yakında",
    },
  },
};

export default tr;
