// ===== 헤더: 스크롤하면 아래쪽 선 =====
const header = document.querySelector(".top");
const onScroll = () => header.classList.toggle("is-scrolled", scrollY > 8);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

const readStore = (name) => { try { return JSON.parse(localStorage.getItem(name)) || {}; } catch { return {}; } };
const assetPath = (src) => {
  const path = decodeURI(new URL(src, location.href).pathname);
  return path.slice(path.indexOf("assets/"));
};
const cropKey = (img) => assetPath(img.getAttribute("src"));

// ===== 이미지 확대·위치 (crops.js의 IMAGE_CROPS + 편집 모드에서 바꾼 값) =====
const CROP_STORE = "v4:imageCrops";
let cropEdits = readStore(CROP_STORE);
const cropFor = (key) => cropEdits[key] ?? window.IMAGE_CROPS?.[key] ?? null;

function setCrop(img, c) {
  const pos = c ? `${c.x}% ${c.y}%` : "";
  img.style.objectPosition = pos;
  img.style.transformOrigin = pos;
  img.style.scale = c && c.s !== 1 ? String(c.s) : "";
  // 축소(100% 미만)하면 틀에 생기는 여백을 채울 배경색
  const frame = img.parentElement;
  if (frame?.classList.contains("frame") && !frame.classList.contains("crop-editor__view")) frame.style.backgroundColor = c?.b || "";
}
const applyCrops = (root) => root.querySelectorAll(".frame img").forEach((img) => setCrop(img, cropFor(cropKey(img))));

// 폴더 안 이미지를 잘라낼 틀(.frame)로 감싸기
function frameImages(root) {
  root.querySelectorAll(".gallery-modal__grid img").forEach((img) => {
    if (img.parentElement.classList.contains("frame")) return;
    const frame = document.createElement("span");
    frame.className = "frame";
    img.replaceWith(frame);
    frame.append(img);
  });
}

// ===== 영상 썸네일 (data-video): 화면에 보일 때 소리 없이 반복 재생 =====
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const loopIO = new IntersectionObserver((entries) => {
  entries.forEach(({ target, isIntersecting }) => (isIntersecting ? target.play().catch(() => {}) : target.pause()));
});
function loopVideos(root) {
  if (reduceMotion) return;
  root.querySelectorAll(".frame img[data-video]").forEach((img) => {
    const frame = img.parentElement;
    if (frame.querySelector(".loop-video")) return;
    const v = document.createElement("video");
    v.className = "loop-video";
    v.src = img.dataset.video;
    v.poster = img.getAttribute("src");
    v.muted = v.loop = v.playsInline = true;
    v.preload = "none";
    v.setAttribute("aria-hidden", "true");
    frame.append(v);
    loopIO.observe(v);
  });
}

// ===== 브랜드 메인 이미지 자리: 커버 1장 + 아래 이미지들 =====
// 캡션은 이미지(data-title/data-sub)에 붙여 두어 순서를 바꾸면 함께 움직임
const heroSlots = (ch) => [ch.querySelector(".chapter__cover > .frame"), ...ch.querySelectorAll(".stills .frame")].filter(Boolean);
const heroImgs = (ch) => heroSlots(ch).map((frame) => frame.querySelector("img"));

document.querySelectorAll(".chapter").forEach((ch) => {
  const cover = ch.querySelector(".chapter__cover > .frame img");
  if (!cover) return;
  let cap = ch.querySelector(".chapter__cap");
  if (!cap) {
    cap = document.createElement("p");
    cap.className = "chapter__cap";
    ch.querySelector(".chapter__panel").append(cap);
  }
  cover.dataset.title = cap.querySelector("strong")?.textContent ?? "";
  cover.dataset.sub = cap.textContent.slice(cover.dataset.title.length);
  ch.querySelectorAll(".still").forEach((fig) => {
    const img = fig.querySelector("img");
    img.dataset.title = fig.querySelector("figcaption strong")?.textContent ?? "";
    img.dataset.sub = fig.querySelector("figcaption span")?.textContent ?? "";
  });
});

function placeHeroes(ch, imgs) {
  heroSlots(ch).forEach((frame, i) => {
    frame.querySelector(".loop-video")?.remove();
    frame.prepend(imgs[i]);
  });
  const [coverImg, ...rest] = imgs;
  const cap = ch.querySelector(".chapter__cap");
  cap.replaceChildren();
  if (coverImg.dataset.title) {
    const strong = document.createElement("strong");
    strong.textContent = coverImg.dataset.title;
    cap.append(strong, coverImg.dataset.sub);
  }
  cap.hidden = !coverImg.dataset.title;
  rest.forEach((img) => {
    const fc = img.closest(".still").querySelector("figcaption");
    fc.querySelector("strong").textContent = img.dataset.title;
    fc.querySelector("span").textContent = img.dataset.sub;
  });
  loopVideos(ch);
}

// ===== 대표 사진 바꾸기 (crops.js의 IMAGE_SWAP + 편집 모드에서 바꾼 값) =====
// 자리 이름 → 이미지 경로. 자리: 메인 이미지(hero:브랜드:원래 경로), 폴더 카드 대표(cover:템플릿 id), 브랜드 목록 로고(thumb:브랜드)
const SWAP_STORE = "v4:imageSwap";
let swapEdits = readStore(SWAP_STORE);
const swapFor = (key) => swapEdits[key] ?? window.IMAGE_SWAP?.[key] ?? null;
const SWAP_TARGETS = ".index__logo, .chapter__cover > .frame img, .still img, .tile img";
const imgKey = (img) => img.dataset.orig || cropKey(img);

function swapSlot(img) {
  const row = img.closest(".index__row");
  if (row) return `thumb:${row.getAttribute("href").slice(1)}`;
  const tile = img.closest(".tile");
  if (tile) return `cover:${tile.dataset.gallery}`;
  const ch = img.closest(".chapter");
  return ch ? `hero:${ch.id}:${imgKey(img)}` : null;
}

// 폴더 안에서 같은 사진을 찾아 영상 정보(data-video)도 함께 가져오기
function findSource(src) {
  const path = assetPath(src);
  for (const tpl of document.querySelectorAll('template[id^="gallery-"]')) {
    for (const im of tpl.content.querySelectorAll("img")) if (assetPath(im.getAttribute("src")) === path) return im;
  }
  return null;
}

// src가 비어 있으면 원래 사진으로 되돌리기
function setPhoto(img, src) {
  if (!img.dataset.orig) {
    img.dataset.orig = cropKey(img);
    img.dataset.origSrc = img.getAttribute("src");
    img.dataset.origVideo = img.dataset.video || "";
  }
  img.setAttribute("src", src || img.dataset.origSrc);
  const video = src ? findSource(src)?.dataset.video : img.dataset.origVideo;
  if (video) img.dataset.video = video;
  else delete img.dataset.video;
  const frame = img.parentElement;
  if (!frame.classList.contains("frame")) return;
  frame.querySelector(".loop-video")?.remove();
  setCrop(img, cropFor(cropKey(img)));
  loopVideos(frame.parentElement);
}
document.querySelectorAll(SWAP_TARGETS).forEach((img) => {
  const src = swapFor(swapSlot(img));
  if (src) setPhoto(img, src);
});

// ===== 이미지 순서 (crops.js의 IMAGE_ORDER + 편집 모드에서 바꾼 값) =====
// 목록 이름 → 항목 이름 배열. 목록: 메인 이미지(hero:브랜드), 폴더 카드 줄(cards:브랜드:번호), 폴더 안 이미지(tpl:템플릿 id)
const ORDER_STORE = "v4:imageOrder";
let orderEdits = readStore(ORDER_STORE);
const orderFor = (key) => orderEdits[key] ?? window.IMAGE_ORDER?.[key] ?? null;
const itemKey = (el) => {
  const btn = el.closest("[data-gallery]") || el.querySelector("[data-gallery]");
  if (btn) return btn.dataset.gallery;
  const img = el.querySelector("img");
  return img?.getAttribute("src") ? imgKey(img) : null;
};

function orderLists() {
  const lists = [];
  document.querySelectorAll(".chapter").forEach((ch) => {
    if (heroSlots(ch).length) lists.push({ key: `hero:${ch.id}`, hero: ch });
    ch.querySelectorAll(".rail").forEach((el, i) => lists.push({ key: `cards:${ch.id}:${i + 1}`, el }));
  });
  document.querySelectorAll('template[id^="gallery-"]').forEach((tpl) => {
    const el = tpl.content.querySelector(".gallery-modal__grid");
    if (el) lists.push({ key: `tpl:${tpl.id}`, el });
  });
  return lists;
}

// "연출컷 03"처럼 번호로 끝나는 캡션은 바뀐 순서대로 다시 번호 붙이기
function renumber(grid) {
  const counts = {};
  grid.querySelectorAll("figcaption").forEach((cap) => {
    if (!cap.dataset.base) {
      const m = cap.textContent.match(/^(.*\S)\s(\d{2})$/);
      if (!m) return;
      cap.dataset.base = m[1];
    }
    const n = (counts[cap.dataset.base] = (counts[cap.dataset.base] || 0) + 1);
    cap.textContent = `${cap.dataset.base} ${String(n).padStart(2, "0")}`;
  });
}

const sortBy = (items, keyOf, order) => items
  .map((it, i) => { const r = order.indexOf(keyOf(it)); return [it, r < 0 ? order.length : r, i]; })
  .sort((a, b) => a[1] - b[1] || a[2] - b[2])
  .map(([it]) => it);

function applyOrder(list, order) {
  if (list.hero) {
    if (order) placeHeroes(list.hero, sortBy(heroImgs(list.hero), imgKey, order));
    return;
  }
  if (order) sortBy([...list.el.children], itemKey, order).forEach((it) => list.el.append(it));
  if (list.el.classList.contains("gallery-modal__grid")) renumber(list.el);
}
orderLists().forEach((list) => { if (orderFor(list.key)) applyOrder(list, orderFor(list.key)); });

applyCrops(document);
loopVideos(document);

// ===== 사진 삭제 (crops.js의 IMAGE_HIDE + 편집 모드에서 지운 값) =====
// 이름: 폴더 안 사진(tpl:템플릿 id:경로), 큰 사진(still:브랜드:경로), 폴더 카드(tile:템플릿 id)
const HIDE_STORE = "v4:imageHide";
const EDITING = new URLSearchParams(location.search).has("edit");
let hideEdits = readStore(HIDE_STORE);
const isHidden = (key) => (hideEdits[key] ?? window.IMAGE_HIDE?.[key]) === true;
function applyHides() {
  document.querySelectorAll('template[id^="gallery-"]').forEach((tpl) => {
    let n = 0;
    tpl.content.querySelectorAll(".gallery-modal__grid figure").forEach((fig) => {
      const img = fig.querySelector("img");
      if (!img) return;
      fig.dataset.hideKey = `tpl:${tpl.id}:${assetPath(img.getAttribute("src"))}`;
      const h = isHidden(fig.dataset.hideKey);
      fig.classList.toggle("is-deleted", h);
      if (!h) n++;
    });
    const num = tpl.content.querySelector(".gallery-modal__head h3 span");
    if (num) num.textContent = n;
    document.querySelectorAll(`[data-gallery="${tpl.id}"] .tile__count`).forEach((c) => { c.textContent = `+${n}`; });
  });
  document.querySelectorAll(".still").forEach((fig) => {
    const img = fig.querySelector("img");
    const ch = fig.closest(".chapter");
    if (!img || !ch) return;
    fig.dataset.hideKey = `still:${ch.id}:${img.dataset.orig || cropKey(img)}`;
    fig.classList.toggle("is-deleted", isHidden(fig.dataset.hideKey));
  });
  document.querySelectorAll(".tile[data-gallery]").forEach((tile) => {
    tile.dataset.hideKey = `tile:${tile.dataset.gallery}`;
    tile.classList.toggle("is-deleted", isHidden(tile.dataset.hideKey));
  });
}
document.body.classList.toggle("is-editing", EDITING);
applyHides();

// ===== 화면에 들어올 때 살짝 올라오기 =====
const revealIO = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("is-in");
    revealIO.unobserve(e.target);
  });
}, { rootMargin: "0px 0px -8% 0px" });
document.querySelectorAll(".reveal").forEach((el) => revealIO.observe(el));

// ===== 가로 카드 줄: ← → 버튼 =====
document.querySelectorAll(".group").forEach((group) => {
  const rail = group.querySelector(".rail");
  const nav = group.querySelector(".group__nav");
  const [prev, next] = nav.querySelectorAll("button");
  const update = () => {
    const max = rail.scrollWidth - rail.clientWidth;
    nav.hidden = max < 4;
    prev.disabled = rail.scrollLeft < 4;
    next.disabled = rail.scrollLeft > max - 4;
  };
  const step = (dir) => rail.scrollBy({ left: dir * rail.clientWidth * 0.9, behavior: "smooth" });
  prev.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));
  rail.addEventListener("scroll", update, { passive: true });
  addEventListener("resize", update);
  update();
});

// ===== 폴더 열기 =====
const modal = document.querySelector(".modal");
const modalBody = modal.querySelector(".modal__body");

document.querySelectorAll("[data-gallery]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tpl = document.getElementById(btn.dataset.gallery);
    modal.dataset.tpl = tpl.id;
    modalBody.replaceChildren(tpl.content.cloneNode(true));
    frameImages(modalBody);
    applyCrops(modalBody);
    // 사진 아래 설명은 이름 없이 순번(01, 02…)만
    let capNo = 0;
    modalBody.querySelectorAll(".gallery-modal__grid figure").forEach((fig) => {
      if (fig.classList.contains("is-deleted")) return;
      const cap = fig.querySelector("figcaption");
      if (cap) cap.textContent = String(++capNo).padStart(2, "0");
    });
    // 각 이미지를 버튼으로 감싸서 클릭하면 크게 보기
    modalBody.querySelectorAll(".gallery-modal__grid figure").forEach((fig) => {
      const frame = fig.querySelector(".frame");
      const zoom = document.createElement("button");
      zoom.type = "button";
      zoom.setAttribute("aria-label", `${frame.querySelector("img").alt} 크게 보기`);
      frame.replaceWith(zoom);
      zoom.append(frame);
      zoom.addEventListener("click", () => openLightbox(lbFigures().indexOf(fig)));
    });
    loopVideos(modalBody);
    modal.showModal();
    modalBody.scrollTop = 0;
  });
});
modal.querySelector(".modal__close").addEventListener("click", () => modal.close());
modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); });

// ===== 크게 보기 (영상 항목은 소리와 함께 재생) =====
const lb = document.querySelector(".lb");
const lbImg = lb.querySelector(".lb__img");
const lbVideo = lb.querySelector(".lb__video");
const lbCap = lb.querySelector(".lb__cap");
const lbPrev = lb.querySelector(".lb__prev");
const lbNext = lb.querySelector(".lb__next");
// 크게 보기에서도 폴더 화면과 같은 정사각형 틀 + 정해 둔 확대·위치(crops.js) 적용
const lbFrame = document.createElement("span");
lbFrame.className = "lb__frame";
lbImg.replaceWith(lbFrame);
lbFrame.append(lbImg);
let lbIndex = 0;
const lbFigures = () => [...modalBody.querySelectorAll(".gallery-modal__grid figure:not(.is-deleted)")];

function showLightbox(i) {
  const figs = lbFigures();
  lbIndex = (i + figs.length) % figs.length;
  const fig = figs[lbIndex];
  const img = fig.querySelector("img");
  const video = img.dataset.video;
  lbImg.hidden = !!video;
  lbFrame.hidden = !!video;
  lbVideo.hidden = !video;
  lbVideo.pause();
  if (video) {
    lbVideo.poster = img.dataset.poster || "";
    lbVideo.src = video;
    lbVideo.play().catch(() => {});
  } else {
    lbVideo.removeAttribute("src");
    lbVideo.load();
    lbImg.src = img.src;
    lbImg.alt = img.alt;
    const c = cropFor(cropKey(img));
    const pos = c ? `${c.x}% ${c.y}%` : "";
    lbImg.style.objectPosition = pos;
    lbImg.style.transformOrigin = pos;
    lbImg.style.scale = c && c.s !== 1 ? String(c.s) : "";
    lbFrame.style.backgroundColor = c?.b || "";
  }
  lbCap.textContent = `${String(lbIndex + 1).padStart(2, "0")} / ${String(figs.length).padStart(2, "0")}`;
  lbPrev.hidden = lbNext.hidden = figs.length < 2;
}
function openLightbox(i) {
  showLightbox(i);
  lb.showModal();
}
lbPrev.addEventListener("click", () => showLightbox(lbIndex - 1));
lbNext.addEventListener("click", () => showLightbox(lbIndex + 1));
lb.querySelector(".lb__close").addEventListener("click", () => lb.close());
lb.addEventListener("close", () => lbVideo.pause());
lb.addEventListener("click", (e) => { if (e.target === lb || e.target.classList.contains("lb__stage")) lb.close(); });
lb.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") showLightbox(lbIndex - 1);
  if (e.key === "ArrowRight") showLightbox(lbIndex + 1);
});

// ===== 편집 모드: index.html?edit=1 (비율 · 순서 · 사진) =====
if (new URLSearchParams(location.search).has("edit")) {
  const bar = document.createElement("div");
  bar.className = "crop-bar";
  bar.innerHTML = `<span class="crop-bar__modes">
      <button type="button" data-mode="crop">크기</button>
      <button type="button" data-mode="order">순서</button>
      <button type="button" data-mode="swap">사진</button>
      <button type="button" data-mode="hide">삭제</button>
    </span>
    <span><span class="crop-bar__msg"></span> (<b class="crop-bar__count"></b>개 변경)</span>
    <button type="button" class="crop-bar__clear">변경 취소</button>
    <button type="button" class="crop-bar__save is-primary">설정 파일 받기</button>`;
  document.body.append(bar);
  const countEl = bar.querySelector(".crop-bar__count");
  const msgEl = bar.querySelector(".crop-bar__msg");
  const updateCount = () => {
    countEl.textContent = Object.keys(cropEdits).length + Object.keys(orderEdits).length + Object.keys(swapEdits).length + Object.keys(hideEdits).length;
  };
  updateCount();
  // 편집 중에는 모든 이미지가 바로 보이게
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-in"));

  let mode = "crop";
  const MSG = {
    crop: "크기 · 위치 편집 · 이미지를 클릭하세요",
    order: "순서 편집 · ← → 를 누르거나 카드를 끌어다 놓으세요 (폴더 안 이미지는 카드를 열어서)",
    swap: "사진 바꾸기 · 브랜드 메인 이미지, 작은 사진, 폴더 카드를 클릭하세요",
    hide: "삭제 · 지울 사진이나 폴더 카드를 클릭하세요 (흐린 사진을 다시 누르면 되살아나요 · 폴더 안 사진은 +숫자를 눌러 열어서)",
  };
  const setMode = (m) => {
    mode = m;
    msgEl.textContent = MSG[m];
    bar.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("is-on", b.dataset.mode === m));
    document.body.classList.toggle("is-cropping", m === "crop");
    document.body.classList.toggle("is-ordering", m === "order");
    document.body.classList.toggle("is-swapping", m === "swap");
    document.body.classList.toggle("is-hiding", m === "hide");
    if (m === "order") decorateAll();
    else document.querySelectorAll(".order-ctl").forEach((c) => c.remove());
  };
  bar.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

  // ---------- 순서 ----------
  const listByKey = (key) => {
    if (key.startsWith("tpl:")) return { key, el: modalBody.querySelector(".gallery-modal__grid") };
    return orderLists().find((l) => l.key === key);
  };
  const addCtl = (host, key) => {
    if (host.querySelector(":scope > .order-ctl")) return;
    host.dataset.orderKey = key;
    const ctl = document.createElement("span");
    ctl.className = "order-ctl";
    ctl.innerHTML = `<button type="button" data-move="-1" aria-label="앞으로">←</button><button type="button" data-move="1" aria-label="뒤로">→</button>`;
    host.append(ctl);
  };
  function decorateAll() {
    orderLists().forEach((list) => {
      if (list.hero) heroSlots(list.hero).forEach((frame) => addCtl(frame, list.key));
      else if (list.el.isConnected) [...list.el.children].forEach((it) => addCtl(it, list.key));
    });
    decorateModal();
  }
  function decorateModal() {
    const grid = modalBody.querySelector(".gallery-modal__grid");
    if (mode === "order" && grid && modal.dataset.tpl) [...grid.children].forEach((fig) => addCtl(fig, `tpl:${modal.dataset.tpl}`));
  }
  new MutationObserver(decorateModal).observe(modalBody, { childList: true });

  function commit(list) {
    const order = list.hero ? heroImgs(list.hero).map(imgKey) : [...list.el.children].map(itemKey);
    orderEdits[list.key] = order;
    localStorage.setItem(ORDER_STORE, JSON.stringify(orderEdits));
    if (list.key.startsWith("tpl:")) {
      renumber(list.el);
      applyOrder({ el: document.getElementById(list.key.slice(4)).content.querySelector(".gallery-modal__grid") }, order);
    }
    updateCount();
  }

  document.addEventListener("click", (e) => {
    if (mode !== "order") return;
    const move = e.target.closest(".order-ctl button");
    if (move) {
      e.preventDefault();
      e.stopPropagation();
      const host = move.closest("[data-order-key]");
      const list = listByKey(host.dataset.orderKey);
      const dir = Number(move.dataset.move);
      if (list.hero) {
        const imgs = heroImgs(list.hero);
        const i = heroSlots(list.hero).indexOf(host);
        const j = i + dir;
        if (j < 0 || j >= imgs.length) return;
        [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
        placeHeroes(list.hero, imgs);
      } else {
        const sibling = dir < 0 ? host.previousElementSibling : host.nextElementSibling;
        if (!sibling) return;
        if (dir < 0) list.el.insertBefore(host, sibling);
        else list.el.insertBefore(sibling, host);
      }
      commit(list);
      return;
    }
    // 폴더 안 이미지는 순서 편집 중에 크게 보기 열지 않음
    if (e.target.closest(".gallery-modal__grid")) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // 카드·폴더 안 이미지는 마우스로 끌어다 놓기 (터치 화면은 ← → 버튼 사용)
  let press = null;
  let justDragged = false;
  document.addEventListener("pointerdown", (e) => {
    if (mode !== "order" || e.pointerType === "touch" || e.button !== 0 || e.target.closest(".order-ctl")) return;
    const item = e.target.closest(".rail > [data-order-key], .gallery-modal__grid > [data-order-key]");
    if (!item) return;
    e.preventDefault();
    press = { item, x: e.clientX, y: e.clientY, moving: false };
  });
  document.addEventListener("pointermove", (e) => {
    if (!press) return;
    if (!press.moving) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6) return;
      press.moving = true;
      press.item.classList.add("is-dragging");
    }
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-order-key]");
    if (!over || over === press.item || over.parentElement !== press.item.parentElement) return;
    const r = over.getBoundingClientRect();
    over.parentElement.insertBefore(press.item, e.clientX > r.left + r.width / 2 ? over.nextElementSibling : over);
  });
  document.addEventListener("pointerup", () => {
    if (!press) return;
    if (press.moving) {
      press.item.classList.remove("is-dragging");
      commit(listByKey(press.item.dataset.orderKey));
      justDragged = true;
      setTimeout(() => { justDragged = false; }, 0);
    }
    press = null;
  });
  // 끌어다 놓은 직후의 클릭은 무시 (폴더가 열리지 않게)
  document.addEventListener("click", (e) => { if (justDragged) { e.preventDefault(); e.stopPropagation(); } }, true);

  // ---------- 비율 ----------
  const editor = document.createElement("dialog");
  editor.className = "crop-editor";
  editor.innerHTML = `<p class="crop-editor__title">이미지 크기 · 위치 조정</p>
    <p class="crop-editor__hint">슬라이더로 크기를 줄이거나 키우고, 드래그해서 위치를 옮기세요. 100%보다 작게 하면 남는 여백은 배경색으로 채워집니다.</p>
    <span class="frame crop-editor__view"><img alt="" /></span>
    <label class="crop-editor__zoom">크기 <input type="range" min="0.5" max="2.5" step="0.01" /> <output></output></label>
    <div class="crop-editor__bg">배경색 <input type="color" value="#ffffff" />
      <button type="button" class="is-eyedrop">사진에서 색 고르기</button>
      <button type="button" class="is-bgclear">기본 배경</button></div>
    <div class="crop-editor__actions">
      <button type="button" class="is-reset">원본 전체 보기</button>
      <button type="button" class="is-cancel">취소</button>
      <button type="button" class="is-primary is-apply">적용</button>
    </div>`;
  document.body.append(editor);
  const view = editor.querySelector(".crop-editor__view");
  const viewImg = view.querySelector("img");
  const zoomInput = editor.querySelector('input[type="range"]');
  const bgInput = editor.querySelector('input[type="color"]');
  const bgBox = editor.querySelector(".crop-editor__bg");
  const zoomOut = editor.querySelector("output");
  let target = null;
  let draft = null;

  const renderDraft = () => {
    setCrop(viewImg, draft);
    view.style.backgroundColor = draft.b || "";
    if (draft.b) bgInput.value = draft.b;
    bgBox.classList.toggle("is-dim", draft.s >= 1);
    zoomInput.value = draft.s;
    zoomOut.textContent = `${Math.round(draft.s * 100)}%`;
  };
  function openEditor(img) {
    target = img;
    const box = img.parentElement.getBoundingClientRect();
    // 페이지에서 보이는 틀과 같은 비율로 미리보기
    view.style.aspectRatio = `${box.width} / ${box.height}`;
    view.style.width = `min(100%, calc(60vh * ${box.width / box.height}))`;
    viewImg.src = img.src;
    draft = { s: 1, x: 50, y: 50, ...cropFor(cropKey(img)) };
    renderDraft();
    editor.showModal();
  }

  // 비율 모드에서는 이미지 클릭 = 편집 (카드의 "+N" 배지는 그대로 폴더 열기)
  document.addEventListener("click", (e) => {
    if (mode !== "crop" || e.target.closest(".tile__count")) return;
    const frame = e.target.closest(".frame");
    if (!frame || frame === view || frame.closest(".crop-editor, .swap-picker")) return;
    const img = frame.querySelector("img");
    if (!img?.getAttribute("src")) return;
    e.preventDefault();
    e.stopPropagation();
    openEditor(img);
  }, true);

  zoomInput.addEventListener("input", () => { draft.s = Number(zoomInput.value); renderDraft(); });
  let drag = null;
  view.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, cx: draft.x, cy: draft.y };
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const r = view.getBoundingClientRect();
    const nw = viewImg.naturalWidth, nh = viewImg.naturalHeight;
    // 틀을 채운(cover) 이미지가 틀보다 남는 양 + 확대로 생긴 여유 = 움직일 수 있는 범위
    const fill = Math.max(r.width / nw, r.height / nh);
    const spanX = nw * fill * draft.s - r.width;
    const spanY = nh * fill * draft.s - r.height;
    const clamp = (v) => Math.min(100, Math.max(0, v));
    if (spanX > 0.5) draft.x = clamp(drag.cx - ((e.clientX - drag.x) / spanX) * 100);
    // 축소해서 틀보다 작아지면 끄는 방향 그대로 사진이 움직이게
    else if (spanX < -0.5) draft.x = clamp(drag.cx + ((e.clientX - drag.x) / -spanX) * 100);
    if (spanY > 0.5) draft.y = clamp(drag.cy - ((e.clientY - drag.y) / spanY) * 100);
    else if (spanY < -0.5) draft.y = clamp(drag.cy + ((e.clientY - drag.y) / -spanY) * 100);
    renderDraft();
  });
  view.addEventListener("pointerup", () => { drag = null; });

  const round = (c) => {
    const r = { s: Math.round(c.s * 1000) / 1000, x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10 };
    if (c.b && r.s < 1) r.b = c.b;
    return r;
  };
  bgInput.addEventListener("input", () => { draft.b = bgInput.value; renderDraft(); });
  editor.querySelector(".is-bgclear").addEventListener("click", () => { delete draft.b; renderDraft(); });
  const eyedrop = editor.querySelector(".is-eyedrop");
  if (!("EyeDropper" in window)) eyedrop.hidden = true;
  eyedrop.addEventListener("click", async () => {
    try { draft.b = (await new EyeDropper().open()).sRGBHex; renderDraft(); } catch {}
  });
  editor.querySelector(".is-reset").addEventListener("click", () => { draft = { s: 1, x: 50, y: 50 }; renderDraft(); });
  editor.querySelector(".is-cancel").addEventListener("click", () => editor.close());
  editor.querySelector(".is-apply").addEventListener("click", () => {
    const key = cropKey(target);
    cropEdits[key] = round(draft);
    localStorage.setItem(CROP_STORE, JSON.stringify(cropEdits));
    document.querySelectorAll(".frame img").forEach((img) => {
      if (img !== viewImg && img.getAttribute("src") && cropKey(img) === key) setCrop(img, cropFor(key));
    });
    updateCount();
    editor.close();
  });

  // ---------- 사진 ----------
  const picker = document.createElement("dialog");
  picker.className = "crop-editor swap-picker";
  picker.innerHTML = `<p class="crop-editor__title">사진 바꾸기</p>
    <p class="crop-editor__hint"></p>
    <div class="swap-picker__tabs">
      <button type="button" data-scope="brand" class="is-on">이 브랜드 사진</button>
      <button type="button" data-scope="all">모든 사진</button>
      <label class="swap-picker__upload">컴퓨터에서 올리기<input type="file" accept="image/*" hidden /></label>
    </div>
    <div class="swap-picker__grid"></div>
    <div class="crop-editor__actions">
      <button type="button" class="is-reset">원래 사진으로</button>
      <button type="button" class="is-cancel">취소</button>
    </div>`;
  document.body.append(picker);
  const pickGrid = picker.querySelector(".swap-picker__grid");
  let swapTarget = null;
  let pickScope = "brand";

  // 사이트 전체 사진 (브랜드 상관없이)
  function allCandidates() {
    const list = [];
    const add = (src) => { if (src && !src.startsWith("data:") && !list.some((s) => assetPath(s) === assetPath(src))) list.push(src); };
    document.querySelectorAll(".chapter img").forEach((im) => add(im.dataset.origSrc || im.getAttribute("src")));
    document.querySelectorAll('template[id^="gallery-"]').forEach((t) => t.content.querySelectorAll("img").forEach((im) => add(im.getAttribute("src"))));
    return list;
  }
  function renderPicks() {
    picker.querySelectorAll("[data-scope]").forEach((b) => b.classList.toggle("is-on", b.dataset.scope === pickScope));
    const current = swapTarget.getAttribute("src");
    const list = pickScope === "all" ? allCandidates() : candidates(swapTarget);
    pickGrid.replaceChildren(...list.map((src) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = assetPath(src) === assetPath(current) ? "is-current" : "";
      b.innerHTML = `<img alt="" loading="lazy" />`;
      b.querySelector("img").src = src;
      b.addEventListener("click", () => choosePhoto(src));
      return b;
    }));
  }
  picker.querySelectorAll("[data-scope]").forEach((b) => b.addEventListener("click", () => { pickScope = b.dataset.scope; renderPicks(); }));
  // 컴퓨터의 사진: 긴 변 1600px JPEG로 줄여서 저장
  picker.querySelector('input[type="file"]').addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const bm = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bm.width, bm.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bm.width * k);
    c.height = Math.round(bm.height * k);
    c.getContext("2d").drawImage(bm, 0, 0, c.width, c.height);
    try { choosePhoto(c.toDataURL("image/jpeg", 0.85)); }
    catch { alert("사진이 너무 커서 저장하지 못했어요. 더 작은 사진으로 다시 시도해 주세요."); }
  });

  // 폴더 카드는 그 폴더 안 사진, 나머지는 같은 브랜드의 모든 사진
  function candidates(img) {
    const slot = swapSlot(img);
    const ch = document.getElementById(slot.startsWith("thumb:") ? slot.slice(6) : img.closest(".chapter").id);
    const list = [];
    const add = (im) => {
      const src = im.dataset.origSrc || im.getAttribute("src");
      if (src && !list.some((s) => assetPath(s) === assetPath(src))) list.push(src);
    };
    let ids = [slot.slice(6)];
    if (!slot.startsWith("cover:")) {
      heroImgs(ch).forEach(add);
      ids = [...ch.querySelectorAll("[data-gallery]")].map((b) => b.dataset.gallery);
    }
    ids.forEach((id) => document.getElementById(id)?.content.querySelectorAll("img").forEach(add));
    return list;
  }

  function openPicker(img) {
    swapTarget = img;
    picker.querySelector(".crop-editor__hint").textContent = (swapSlot(img).startsWith("cover:")
      ? "이 폴더 안의 사진 중에서 고르세요."
      : "이 브랜드의 사진 중에서 고르세요.") + " '모든 사진'에서 다른 브랜드 사진을, '컴퓨터에서 올리기'로 새 사진을 고를 수도 있어요.";
    pickScope = "brand";
    renderPicks();
    picker.showModal();
  }

  function choosePhoto(src) {
    const slot = swapSlot(swapTarget);
    const isOrig = !src || assetPath(src) === imgKey(swapTarget);
    // 원래 사진이면 기록을 지우고, crops.js에 저장된 값이 있으면 ""로 덮어서 원래대로
    if (isOrig) {
      if (window.IMAGE_SWAP?.[slot]) swapEdits[slot] = "";
      else delete swapEdits[slot];
    } else swapEdits[slot] = src;
    localStorage.setItem(SWAP_STORE, JSON.stringify(swapEdits));
    setPhoto(swapTarget, isOrig ? "" : src);
    if (src?.startsWith("data:")) setCrop(swapTarget, null);
    updateCount();
    picker.close();
  }
  picker.querySelector(".is-reset").addEventListener("click", () => choosePhoto(""));
  picker.querySelector(".is-cancel").addEventListener("click", () => picker.close());

  document.addEventListener("click", (e) => {
    if (mode !== "swap" || e.target.closest(".tile__count, .crop-bar, .swap-picker, .modal")) return;
    const host = e.target.closest(".index__row, .chapter__cover > .frame, .still, .tile");
    const img = host?.querySelector(host.classList.contains("index__row") ? ".index__logo" : "img");
    if (!img?.matches(SWAP_TARGETS)) return;
    e.preventDefault();
    e.stopPropagation();
    openPicker(img);
  }, true);

  // ---------- 삭제 ----------
  document.addEventListener("click", (e) => {
    if (mode !== "hide" || e.target.closest(".tile__count, .crop-bar, .crop-editor")) return;
    const item = e.target.closest(".still, .tile[data-gallery], .modal .gallery-modal__grid figure");
    if (!item || !item.dataset.hideKey) return;
    e.preventDefault();
    e.stopPropagation();
    const key = item.dataset.hideKey;
    const next = !isHidden(key);
    if (next === (window.IMAGE_HIDE?.[key] === true)) delete hideEdits[key];
    else hideEdits[key] = next;
    localStorage.setItem(HIDE_STORE, JSON.stringify(hideEdits));
    item.classList.toggle("is-deleted", next);
    applyHides();
    // 열려 있는 폴더의 숫자도 같이 맞추기
    const head = modalBody.querySelector(".gallery-modal__head h3 span");
    if (head) head.textContent = modalBody.querySelectorAll(".gallery-modal__grid figure:not(.is-deleted)").length;
    updateCount();
  }, true);

  // ---------- 취소 · 저장 ----------
  bar.querySelector(".crop-bar__clear").addEventListener("click", () => {
    if (!Object.keys(cropEdits).length && !Object.keys(orderEdits).length && !Object.keys(swapEdits).length && !Object.keys(hideEdits).length) return;
    if (!confirm("이 브라우저에서 바꾼 크기·순서·사진·삭제를 모두 취소할까요?")) return;
    [CROP_STORE, ORDER_STORE, SWAP_STORE, HIDE_STORE].forEach((k) => localStorage.removeItem(k));
    location.reload();
  });

  // 기본값 + 변경값을 합친 crops.js 파일로 내려받기 → portfolio/v4/crops.js 교체
  bar.querySelector(".crop-bar__save").addEventListener("click", () => {
    const entries = (obj) => Object.keys(obj).sort().map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(obj[k])}`).join(",\n");
    const swaps = Object.fromEntries(Object.entries({ ...window.IMAGE_SWAP, ...swapEdits }).filter(([, v]) => v));
    const js = `// 이미지별 확대·위치 설정 (편집 모드: index.html?edit=1 에서 이미지를 클릭해 조정 후 "설정 파일 받기")\n`
      + `// s = 확대 배율(1 = 원본 전체), x / y = 보여줄 위치(%, 0 = 왼쪽·위, 100 = 오른쪽·아래)\n`
      + `window.IMAGE_CROPS = {\n${entries({ ...window.IMAGE_CROPS, ...cropEdits })}\n};\n\n`
      + `// 이미지 순서 (편집 모드의 "순서"에서 변경). hero = 메인 이미지, cards = 폴더 카드 줄, tpl = 폴더 안 이미지\n`
      + `window.IMAGE_ORDER = {\n${entries({ ...window.IMAGE_ORDER, ...orderEdits })}\n};\n\n`
      + `// 대표 사진 (편집 모드의 "사진"에서 변경). hero = 메인 이미지, cover = 폴더 카드, thumb = 브랜드 목록 로고\n`
      + `window.IMAGE_SWAP = {\n${entries(swaps)}\n};\n\n`
      + `// 지운 사진 (편집 모드의 "삭제"에서 변경). true = 숨김\n`
      + `window.IMAGE_HIDE = {\n${entries(Object.fromEntries(Object.entries({ ...window.IMAGE_HIDE, ...hideEdits }).filter(([, v]) => v)))}\n};\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([js], { type: "text/javascript" }));
    a.download = "crops.js";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  setMode("crop");
}

// ===== 화면 전환: 이력서 · 자기소개서 · 브랜드 상세 =====
// 처음에는 브랜드마다 첫 장(스토리)만 보이고, 누르면 그 브랜드 상세(사진·설명) 화면으로 들어감
{
  const pages = [...document.querySelectorAll(".page")];
  const chapters = [...document.querySelectorAll(".chapter")];
  const brandName = (c) => c.querySelector(".chapter__panel h2")?.textContent.trim() || c.id;

  chapters.forEach((ch, i) => {
    const story = ch.querySelector(".story");
    if (story) {
      story.setAttribute("role", "link");
      story.tabIndex = 0;
      story.setAttribute("aria-label", `${brandName(ch)} 자세히 보기`);
      const open = () => { if (!ch.classList.contains("is-open")) location.hash = ch.id; };
      story.addEventListener("click", (e) => { if (!document.body.classList.contains("is-editing") || !e.target.closest("img")) open(); });
      story.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    }
    // 상세 화면 위: 전체 브랜드로 돌아가기 / 아래: 다음 브랜드
    const bar = document.createElement("div");
    bar.className = "brand-bar";
    bar.innerHTML = `<a class="brand-bar__back" href="#all">← ALL BRANDS</a><span class="brand-bar__count">${String(i + 1).padStart(2, "0")} / ${String(chapters.length).padStart(2, "0")}</span>`;
    ch.prepend(bar);
    const next = chapters[i + 1] || chapters[0];
    const foot = document.createElement("div");
    foot.className = "brand-next";
    foot.innerHTML = `<a class="brand-next__back" href="#all">← ALL BRANDS</a><a class="brand-next__go" href="#${next.id}"><span>NEXT BRAND</span><strong>${brandName(next)} →</strong></a>`;
    ch.append(foot);
  });

  let openId = null;
  const route = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const page = pages.find((p) => p.id === id);
    const target = id && id !== "all" ? document.getElementById(id) : null;
    const ch = !page && target ? target.closest(".chapter") : null;
    const prev = openId;

    pages.forEach((p) => { p.hidden = p !== page; });
    chapters.forEach((c) => c.classList.toggle("is-open", c === ch));
    openId = ch ? ch.id : null;
    document.body.classList.toggle("is-page-view", !!page);
    document.body.classList.toggle("is-brand-view", !!ch);
    document.querySelectorAll(".top nav a").forEach((a) => a.classList.toggle("is-on", !!page && a.getAttribute("href") === `#${id}`));

    if (ch) {
      ch.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-in"));
      dispatchEvent(new Event("resize"));
      if (id === ch.id) scrollTo({ top: 0, behavior: "instant" });
      else target.scrollIntoView({ behavior: "instant" });
    } else if (page) {
      scrollTo({ top: 0, behavior: "instant" });
    } else if (prev && (!id || id === "all")) {
      dispatchEvent(new Event("resize"));
      document.getElementById(prev)?.scrollIntoView({ behavior: "instant" });
    } else if (target) {
      target.scrollIntoView({ behavior: "instant" });
    }
  };
  addEventListener("hashchange", route);
  route();
}

// ===== 브랜드 스토리: 브랜드 이름이 칸 너비에 꽉 차도록 글자 크기 맞추기 =====
function fitStoryMarks() {
  document.querySelectorAll(".story__mark").forEach((el) => {
    const span = el.querySelector("span");
    if (!span) return;
    el.style.fontSize = "100px";
    const w = span.getBoundingClientRect().width;
    if (w) el.style.fontSize = `${(100 * el.clientWidth) / w}px`;
  });
}
fitStoryMarks();
(document.fonts ? document.fonts.ready : Promise.resolve()).then(fitStoryMarks);
window.addEventListener("resize", fitStoryMarks);
