// 營隊頁渲染邏輯。內容來源：content/camps/{slug}.json + content/shared/camps_common.json
export const SITE = "https://orangeapple.co";

export function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function jsonLd(obj) {
  return '  <script type="application/ld+json">' + JSON.stringify(obj) + "</script>";
}

export function pageUrl(slug) {
  return `${SITE}/camps/${slug}`;
}

// {{SEASON}} 等佔位由共用檔帶入，讓年份只改一處
export function applySeason(text, common) {
  return String(text)
    .replace(/\{\{SEASON\}\}/g, common.season)
    .replace(/\{\{SEASON_TYPE\}\}/g, common.season_type)
    .replace(/\{\{DURATION\}\}/g, common.duration);
}

function list(items, cls = "") {
  return `<ul${cls ? ` class="${cls}"` : ""}>` + items.map((i) => `<li>${esc(i)}</li>`).join("") + "</ul>";
}

export function buildCourseCards(courses, common) {
  return courses.map((c) => {
    const syllabus = c.syllabus.map((s) =>
      `<a class="syllabus-link" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} →</a>`
    ).join("");
    return `<article class="course-card">
          <div class="course-head">
            <h3>${esc(c.name)}</h3>
            <p class="course-meta">${esc(c.grade)}．${esc(c.prerequisite)}．${esc(common.duration)}</p>
          </div>
          <p class="course-intro">${esc(c.intro)}</p>
          <div class="course-syllabus">${syllabus}</div>
        </article>`;
  }).join("\n        ");
}

export function buildCompareTable(courses) {
  const rows = [
    ["適合", (c) => `${esc(c.grade)}<br>${esc(c.prerequisite)}`],
    ["營隊特色", (c) => list(c.features)],
    ["學習技能", (c) => list(c.skills)],
    ["成果收穫", (c) => list(c.outcomes)],
  ];
  const head = "<tr><th scope=\"col\">項目</th>" + courses.map((c) => `<th scope="col">${esc(c.name)}</th>`).join("") + "</tr>";
  const body = rows.map(([label, fn]) =>
    `<tr><th scope="row">${label}</th>` + courses.map((c) => `<td>${fn(c)}</td>`).join("") + "</tr>"
  ).join("");
  return `<table class="compare-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

export function buildPrices(prices) {
  return prices.map((p) =>
    `<p class="price-course">【${esc(p.course)}】</p><ul class="price-list"><li>一般價：${esc(p.regular)}</li><li>晚鳥優惠價：${esc(p.early)}</li></ul>`
  ).join("\n            ");
}

// 梯次／教室由官網動態提供；未接上前顯示導向報名頁的 fallback
export function buildStagesBlock(stages) {
  return `<div id="oa-camp-stages" data-remote-src="${esc(stages.remote_src)}">
              <p class="stages-fallback"><a href="${esc(stages.fallback_url)}">${esc(stages.fallback_text)} →</a></p>
            </div>`;
}

function buildGraph({ camp, common, title, description, url }) {
  const org = {
    "@type": ["EducationalOrganization", "Organization"],
    "@id": `${SITE}/#organization`,
    name: "橘子蘋果程式學苑",
    url: `${SITE}/`,
    logo: `${SITE}/logo-2023-color.svg`,
    foundingDate: "2012",
    sameAs: [
      "https://www.facebook.com/OrangeApplePad",
      "https://www.instagram.com/orangeapple.tw/",
      "https://www.youtube.com/@orangeapple-academy",
    ],
  };
  const breadcrumb = {
    "@type": "BreadcrumbList",
    "@id": `${url}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首頁", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "寒暑假營隊", item: `${SITE}/camps` },
      { "@type": "ListItem", position: 3, name: camp.name, item: url },
    ],
  };
  const webpage = {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url, name: title, description,
    inLanguage: "zh-TW",
    about: { "@id": `${SITE}/#organization` },
  };
  const courses = camp.courses.map((c) => ({
    "@type": "Course",
    name: c.name,
    description: c.intro,
    provider: { "@id": `${SITE}/#organization` },
    educationalLevel: c.grade,
    courseMode: "onsite",
  }));
  return { "@context": "https://schema.org", "@graph": [org, breadcrumb, webpage, ...courses] };
}

export function fillTemplate(template, values) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => (k in values ? values[k] : m));
}

export function renderCampPage({ camp, common, css, pageCss, template }) {
  const url = pageUrl(camp.slug);
  const title = applySeason(camp.meta.title, common) + " — 橘子蘋果程式學苑";
  const description = applySeason(camp.meta.description, common);
  return fillTemplate(template, {
    TITLE: esc(title),
    DESCRIPTION: esc(description),
    PAGE_URL: url,
    SEASON: esc(common.season),
    CAMP_NAME: esc(camp.name),
    HERO_HEADING: esc(applySeason(camp.hero.heading, common)),
    HERO_LEAD: camp.hero.lead.map((p) => `<p class="hero-desc">${esc(p)}</p>`).join("\n        "),
    COURSE_CARDS: buildCourseCards(camp.courses, common),
    COMPARE_TABLE: buildCompareTable(camp.courses),
    TARGET: esc(camp.info.target),
    NOTICE: esc(camp.info.notice),
    STAGES_HEADING: esc(common.stages.heading),
    STAGES_BLOCK: buildStagesBlock(common.stages),
    PRICES: buildPrices(camp.info.prices),
    PRICE_NOTE: esc(camp.info.price_note),
    BOOKING_HEADING: esc(applySeason(common.booking.heading, common)),
    BOOKING_LEAD: esc(applySeason(common.booking.lead, common)),
    BOOKING_CTA: esc(common.stages.fallback_text),
    REGISTRATION_URL: esc(common.registration_url),
    GRAPH_JSON_LD: jsonLd(buildGraph({ camp, common, title, description, url })),
    SHARED_CSS: css,
    PAGE_CSS: pageCss,
  });
}
