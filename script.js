(() => {
  "use strict";

  const isLocalPreview = ["127.0.0.1", "localhost"].includes(window.location.hostname);
  if (isLocalPreview && "serviceWorker" in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => {});
  }
  if (isLocalPreview && "caches" in window) {
    window.caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => window.caches.delete(key))))
      .catch(() => {});
  }

  document.documentElement.classList.add("reveal-ready");

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const motionParam = new URLSearchParams(window.location.search).get("motion");
  let motionPreference = "system";
  try {
    if (["full", "reduced"].includes(motionParam)) {
      window.localStorage.setItem("portfolio-motion", motionParam);
    } else if (motionParam === "system") {
      window.localStorage.removeItem("portfolio-motion");
    }
    motionPreference = window.localStorage.getItem("portfolio-motion") || "system";
  } catch {
    motionPreference = ["full", "reduced"].includes(motionParam) ? motionParam : "system";
  }

  const fullMotionEnabled = () =>
    motionPreference === "full" ||
    (motionPreference !== "reduced" && !prefersReducedMotion.matches);

  const syncMotionPreference = () => {
    const enabled = fullMotionEnabled();
    document.documentElement.classList.toggle("portfolio-motion-enabled", enabled);
    document.documentElement.dataset.motion = enabled ? "full" : "reduced";
    return enabled;
  };

  syncMotionPreference();

  const header = document.getElementById("siteHeader");
  const progress = document.getElementById("scrollProgress");
  const year = document.getElementById("currentYear");
  const localTime = document.getElementById("localTime");

  if (year) year.textContent = String(new Date().getFullYear());

  const updateLocalTime = () => {
    if (!localTime) return;
    try {
      localTime.textContent = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date()) + " IST";
    } catch {
      localTime.textContent = "IST";
    }
  };

  updateLocalTime();
  window.setInterval(updateLocalTime, 30_000);

  let scrollTicking = false;
  const updateScrollState = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = scrollable > 0 ? Math.min(1, Math.max(0, scrollTop / scrollable)) : 0;

    header?.classList.toggle("is-scrolled", scrollTop > 18);
    if (progress) progress.style.transform = `scaleX(${ratio})`;
    scrollTicking = false;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (!scrollTicking) {
        window.requestAnimationFrame(updateScrollState);
        scrollTicking = true;
      }
    },
    { passive: true },
  );
  updateScrollState();

  const revealItems = document.querySelectorAll("[data-reveal]");
  if (!fullMotionEnabled() || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  } else {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    revealItems.forEach((item, index) => {
      item.style.transitionDelay = `${Math.min(index % 4, 3) * 45}ms`;
      revealObserver.observe(item);
    });
  }

  const sections = [...document.querySelectorAll("main .section-anchor[id]")];
  const navLinks = [...document.querySelectorAll("[data-nav-link]")];
  const slideDots = [...document.querySelectorAll("[data-slide-dot]")];
  const sectionLinks = [...navLinks, ...slideDots];
  const updateSectionLinks = (activeId) => {
    sectionLinks.forEach((link) => {
      const isActive = link.getAttribute("href") === activeId;
      link.classList.toggle("is-active", isActive);
      if (isActive) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  };
  if ("IntersectionObserver" in window && sectionLinks.length) {
    const activeObserver = new IntersectionObserver(
      (entries) => {
        if (document.documentElement.classList.contains("slide-deck-enabled")) return;
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;

        updateSectionLinks(`#${visible.target.id}`);
      },
      { rootMargin: "-22% 0px -62% 0px", threshold: [0.05, 0.15, 0.3] },
    );
    sections.forEach((section) => activeObserver.observe(section));
  }

  class SlideDeck {
    constructor(slides) {
      this.slides = slides.filter((section) => section.classList.contains("slide-section"));
      this.mode = window.matchMedia("(min-width: 960px) and (min-height: 650px)");
      this.deckRoot = this.slides[0]?.parentElement || null;
      this.enabled = false;
      this.animating = false;
      this.activeIndex = 0;
      this.leavingIndex = -1;
      this.wheelIntent = 0;
      this.wheelReset = 0;
      this.finishTimer = 0;
      this.cooldownUntil = 0;
      this.duration = 880;

      this.onWheel = this.onWheel.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);
      this.onResize = this.onResize.bind(this);
      this.updateMode = this.updateMode.bind(this);

      this.bindEvents();
      this.updateMode();
    }

    bindEvents() {
      window.addEventListener("wheel", this.onWheel, { passive: false });
      window.addEventListener("keydown", this.onKeyDown);
      window.addEventListener("resize", this.onResize, { passive: true });
      this.mode.addEventListener?.("change", this.updateMode);
      prefersReducedMotion.addEventListener?.("change", this.updateMode);

      document.addEventListener("click", (event) => {
        if (!this.enabled) return;
        const link = event.target.closest('a[href^="#"]');
        if (!link) return;
        const target = document.querySelector(link.getAttribute("href"));
        const index = this.slides.indexOf(target);
        if (index < 0) return;
        event.preventDefault();
        this.goTo(index);
      });

      window.addEventListener("hashchange", () => {
        const index = this.indexFromHash();
        if (!this.enabled) return;
        this.resetScrollOffsets();
        window.requestAnimationFrame(() => this.resetScrollOffsets());
        if (index !== this.activeIndex) this.goTo(index);
      });
    }

    indexFromHash() {
      if (!window.location.hash) return 0;
      const target = document.querySelector(window.location.hash);
      const index = this.slides.indexOf(target);
      return index >= 0 ? index : 0;
    }

    resetScrollOffsets() {
      if (this.deckRoot) {
        this.deckRoot.scrollLeft = 0;
        this.deckRoot.scrollTop = 0;
      }
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }

    closestVerticalIndex() {
      let closest = 0;
      let distance = Number.POSITIVE_INFINITY;
      this.slides.forEach((section, index) => {
        const currentDistance = Math.abs(section.getBoundingClientRect().top);
        if (currentDistance < distance) {
          closest = index;
          distance = currentDistance;
        }
      });
      return closest;
    }

    updateMode() {
      const shouldEnable = this.mode.matches;
      const fullMotion = syncMotionPreference();
      this.duration = fullMotion ? 880 : 0;
      if (shouldEnable === this.enabled) {
        if (this.enabled) this.applyPositions();
        return;
      }

      if (!shouldEnable) {
        const sectionToRestore = this.slides[this.activeIndex];
        this.enabled = false;
        this.animating = false;
        window.clearTimeout(this.finishTimer);
        document.documentElement.classList.remove("slide-deck-enabled", "deck-ready", "is-slide-animating");
        delete document.documentElement.dataset.deckDirection;
        this.clearPositions();
        updateScrollState();
        window.requestAnimationFrame(() => sectionToRestore?.scrollIntoView({ block: "start", behavior: "auto" }));
        return;
      }

      const hashIndex = window.location.hash ? this.indexFromHash() : this.closestVerticalIndex();
      this.activeIndex = hashIndex;
      this.enabled = true;
      this.resetScrollOffsets();
      document.documentElement.classList.add("slide-deck-enabled");
      document.documentElement.classList.remove("deck-ready");
      this.revealSlide(this.activeIndex);
      this.applyPositions();
      this.updateChrome();
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => document.documentElement.classList.add("deck-ready"));
      });
    }

    revealSlide(index) {
      this.slides[index]?.querySelectorAll("[data-reveal]").forEach((item) => item.classList.add("is-visible"));
    }

    clearPositions() {
      this.slides.forEach((section) => {
        ["--deck-x", "--deck-z", "--deck-rotate-y", "--deck-scale", "--deck-opacity"].forEach(
          (property) => section.style.removeProperty(property),
        );
        section.classList.remove("is-deck-active", "is-deck-near", "is-deck-leaving");
        section.removeAttribute("aria-hidden");
        section.inert = false;
      });
    }

    applyPositions() {
      if (!this.enabled) return;

      this.slides.forEach((section, index) => {
        const relative = index - this.activeIndex;
        const side = Math.sign(relative);
        const distance = Math.abs(relative);
        const isActive = relative === 0;
        const isNear = distance <= 1;
        const x = isActive ? "0vw" : `${side * 108}vw`;
        const z = isActive ? "0px" : "-160px";
        const rotateY = isActive ? "0deg" : `${side * -5.5}deg`;
        const scale = isActive ? "1" : "0.965";
        const opacity = isActive ? "1" : isNear || index === this.leavingIndex ? "0.72" : "0";
        section.style.setProperty("--deck-x", x);
        section.style.setProperty("--deck-z", z);
        section.style.setProperty("--deck-rotate-y", rotateY);
        section.style.setProperty("--deck-scale", scale);
        section.style.setProperty("--deck-opacity", opacity);
        section.classList.toggle("is-deck-active", isActive);
        section.classList.toggle("is-deck-near", isNear);
        section.classList.toggle("is-deck-leaving", index === this.leavingIndex);
        section.inert = !isActive;
        section.setAttribute("aria-hidden", isActive ? "false" : "true");
      });
    }

    updateChrome() {
      const activeId = `#${this.slides[this.activeIndex].id}`;
      updateSectionLinks(activeId);
      header?.classList.toggle("is-scrolled", this.activeIndex > 0);
      if (progress) {
        const ratio = this.slides.length > 1 ? this.activeIndex / (this.slides.length - 1) : 0;
        progress.style.transform = `scaleX(${ratio})`;
      }
    }

    onWheel(event) {
      if (!this.enabled || event.ctrlKey) return;
      event.preventDefault();
      if (this.animating || performance.now() < this.cooldownUntil) return;

      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      this.wheelIntent += delta;
      window.clearTimeout(this.wheelReset);
      this.wheelReset = window.setTimeout(() => {
        this.wheelIntent = 0;
      }, 140);

      if (Math.abs(this.wheelIntent) < 26) return;
      const direction = this.wheelIntent > 0 ? 1 : -1;
      this.wheelIntent = 0;
      this.goTo(this.activeIndex + direction);
    }

    onKeyDown(event) {
      if (!this.enabled || this.animating || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.matches("input, textarea, select, button, [contenteditable]")) return;

      const forward = ["ArrowDown", "ArrowRight", "PageDown", " "];
      const backward = ["ArrowUp", "ArrowLeft", "PageUp"];
      let nextIndex = null;
      if (forward.includes(event.key)) nextIndex = this.activeIndex + 1;
      if (backward.includes(event.key)) nextIndex = this.activeIndex - 1;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = this.slides.length - 1;
      if (nextIndex === null) return;

      event.preventDefault();
      this.goTo(nextIndex);
    }

    onResize() {
      if (this.enabled) this.applyPositions();
    }

    goTo(index) {
      if (!this.enabled || this.animating) return;
      const targetIndex = Math.max(0, Math.min(this.slides.length - 1, index));
      if (targetIndex === this.activeIndex) return;

      const previousIndex = this.activeIndex;
      const direction = targetIndex > previousIndex ? 1 : -1;
      this.animating = true;
      this.leavingIndex = previousIndex;
      this.activeIndex = targetIndex;
      this.revealSlide(targetIndex);
      this.resetScrollOffsets();
      document.documentElement.classList.add("is-slide-animating");
      document.documentElement.dataset.deckDirection = direction > 0 ? "next" : "previous";
      this.applyPositions();
      this.updateChrome();
      const hash = `#${this.slides[targetIndex].id}`;
      if (window.location.hash !== hash) history.replaceState(null, "", hash);

      window.clearTimeout(this.finishTimer);
      this.finishTimer = window.setTimeout(() => {
        this.leavingIndex = -1;
        this.animating = false;
        this.cooldownUntil = performance.now() + 100;
        document.documentElement.classList.remove("is-slide-animating");
        delete document.documentElement.dataset.deckDirection;
        this.resetScrollOffsets();
        this.applyPositions();
      }, this.duration + 70);
    }
  }

  if (sections.length) new SlideDeck(sections);

  class ReliabilityLoom {
    constructor(canvas, stage) {
      this.canvas = canvas;
      this.stage = stage;
      this.ctx = canvas.getContext("2d", { alpha: true });
      this.latency = document.getElementById("loomLatency");
      this.trace = document.getElementById("loomTrace");
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.frame = 0;
      this.running = false;
      this.visible = true;
      this.pointerInside = false;
      this.startTime = performance.now();
      this.lastMetricTick = -1;
      this.threadCount = window.innerWidth < 520 ? 13 : 17;
      this.reducedMotion = !fullMotionEnabled();
      this.coarsePointer = window.matchMedia("(pointer: coarse)").matches;
      this.motion = { x: 0, y: 0, tiltX: 0, tiltY: 0 };
      this.targetMotion = { x: 0, y: 0, tiltX: 0, tiltY: 0 };
      this.seeds = Array.from({ length: this.threadCount }, (_, index) => (index * 0.61803398875) % 1);
      this.particles = Array.from({ length: 23 }, (_, index) => ({
        thread: (index * 7 + 3) % this.threadCount,
        phase: (index * 0.173 + 0.07) % 1,
        speed: 0.055 + (index % 5) * 0.009,
        accent: index % 4 === 0,
      }));

      if (!this.ctx) return;
      this.bindEvents();
      this.resize();
      this.stage.classList.add("is-canvas-ready");
      this.draw(performance.now());
      if (!this.reducedMotion) this.start();
    }

    bindEvents() {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.stage);

      this.stage.addEventListener("pointermove", (event) => {
        if (this.reducedMotion || this.coarsePointer || event.pointerType === "touch") return;
        const rect = this.stage.getBoundingClientRect();
        const x = Math.max(-0.5, Math.min(0.5, (event.clientX - rect.left) / rect.width - 0.5));
        const y = Math.max(-0.5, Math.min(0.5, (event.clientY - rect.top) / rect.height - 0.5));
        this.pointerInside = true;
        this.targetMotion.x = x * 8;
        this.targetMotion.y = y * 6;
        this.targetMotion.tiltX = y * -7;
        this.targetMotion.tiltY = x * 9;
      });

      this.stage.addEventListener("pointerleave", () => {
        this.pointerInside = false;
        this.targetMotion.x = 0;
        this.targetMotion.y = 0;
        this.targetMotion.tiltX = 0;
        this.targetMotion.tiltY = 0;
      });

      this.visibilityObserver = new IntersectionObserver(
        ([entry]) => {
          this.visible = entry.isIntersecting;
          if (this.visible && !this.reducedMotion) this.start();
          else this.stop();
        },
        { rootMargin: "100px" },
      );
      this.visibilityObserver.observe(this.stage);

      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.stop();
        else if (this.visible && !this.reducedMotion) this.start();
      });

      prefersReducedMotion.addEventListener?.("change", () => {
        syncMotionPreference();
        this.reducedMotion = !fullMotionEnabled();
        if (this.reducedMotion) {
          this.stop();
          this.draw(performance.now());
        } else if (this.visible) {
          this.start();
        }
      });
    }

    resize() {
      this.width = Math.max(1, this.stage.clientWidth);
      this.height = Math.max(1, this.stage.clientHeight);
      this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.draw(performance.now());
    }

    start() {
      if (this.running || this.reducedMotion) return;
      this.running = true;
      this.frame = window.requestAnimationFrame((time) => this.animate(time));
    }

    stop() {
      this.running = false;
      if (this.frame) window.cancelAnimationFrame(this.frame);
      this.frame = 0;
    }

    animate(time) {
      if (!this.running) return;
      if (!document.documentElement.classList.contains("is-slide-animating")) {
        this.draw(time);
      }
      this.frame = window.requestAnimationFrame((nextTime) => this.animate(nextTime));
    }

    cubic(first, controlOne, controlTwo, last, amount) {
      const inverse = 1 - amount;
      const inverseSquared = inverse * inverse;
      const amountSquared = amount * amount;
      return {
        x:
          inverseSquared * inverse * first.x +
          3 * inverseSquared * amount * controlOne.x +
          3 * inverse * amountSquared * controlTwo.x +
          amountSquared * amount * last.x,
        y:
          inverseSquared * inverse * first.y +
          3 * inverseSquared * amount * controlOne.y +
          3 * inverse * amountSquared * controlTwo.y +
          amountSquared * amount * last.y,
      };
    }

    geometry(index, motionTime) {
      const ratio = index / Math.max(1, this.threadCount - 1);
      const seed = this.seeds[index];
      const endRatio = ((index * 7 + 3) % this.threadCount) / Math.max(1, this.threadCount - 1);
      const padding = this.height * 0.17;
      const usable = this.height - padding * 2;
      const moving = this.reducedMotion ? 0 : Math.sin(motionTime * 0.48 + seed * Math.PI * 2) * 7;
      const startY = padding + ratio * usable;
      const endY = padding + endRatio * usable;
      const middleY = this.height * 0.5 + Math.sin(index * 1.37) * this.height * 0.075 + moving;
      const first = [
        { x: -14, y: startY },
        { x: this.width * 0.18, y: startY + Math.sin(index * 0.9) * 22 },
        { x: this.width * 0.36, y: middleY + Math.cos(index * 1.1) * 18 },
        { x: this.width * 0.5, y: middleY },
      ];
      const second = [
        first[3],
        { x: this.width * 0.65, y: middleY - Math.sin(index * 1.24) * 23 },
        { x: this.width * 0.82, y: endY + Math.cos(index * 0.77) * 20 },
        { x: this.width + 14, y: endY },
      ];
      return { first, second };
    }

    pointOnThread(index, progressValue, motionTime) {
      const progress = Math.max(0, Math.min(1, progressValue));
      const geometry = this.geometry(index, motionTime);
      if (progress <= 0.5) {
        return this.cubic(...geometry.first, progress * 2);
      }
      return this.cubic(...geometry.second, (progress - 0.5) * 2);
    }

    drawBackdrop(motionTime) {
      const { ctx, width, height } = this;
      ctx.save();
      ctx.lineWidth = 0.65;
      ctx.setLineDash([2, 8]);
      [0.22, 0.36, 0.5, 0.64, 0.78].forEach((ratio, index) => {
        const drift = this.reducedMotion ? 0 : Math.sin(motionTime * 0.35 + index) * 3;
        ctx.beginPath();
        ctx.moveTo(width * ratio + drift, height * 0.12);
        ctx.lineTo(width * ratio - drift, height * 0.87);
        ctx.strokeStyle = index === 2 ? "rgba(255, 92, 53, 0.34)" : "rgba(23, 24, 20, 0.17)";
        ctx.stroke();
      });
      ctx.setLineDash([]);

      ctx.font = `${Math.max(7, width * 0.013)}px ${getComputedStyle(document.documentElement).getPropertyValue("--mono")}`;
      ctx.fillStyle = "rgba(23, 24, 20, 0.36)";
      ctx.fillText("INGEST", width * 0.12, height * 0.16);
      ctx.fillText("RETRIEVAL", width * 0.32, height * 0.86);
      ctx.fillText("VERIFY", width * 0.59, height * 0.16);
      ctx.fillText("SERVE", width * 0.79, height * 0.86);
      ctx.restore();
    }

    drawThreads(motionTime) {
      const { ctx } = this;
      for (let index = 0; index < this.threadCount; index += 1) {
        const geometry = this.geometry(index, motionTime);
        const accent = index % 6 === 0;
        const acid = index === Math.floor(this.threadCount * 0.53);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(geometry.first[0].x, geometry.first[0].y);
        ctx.bezierCurveTo(
          geometry.first[1].x,
          geometry.first[1].y,
          geometry.first[2].x,
          geometry.first[2].y,
          geometry.first[3].x,
          geometry.first[3].y,
        );
        ctx.bezierCurveTo(
          geometry.second[1].x,
          geometry.second[1].y,
          geometry.second[2].x,
          geometry.second[2].y,
          geometry.second[3].x,
          geometry.second[3].y,
        );
        if (acid) {
          ctx.strokeStyle = "rgba(151, 181, 36, 0.72)";
          ctx.lineWidth = 1.7;
        } else if (accent) {
          ctx.strokeStyle = "rgba(255, 92, 53, 0.68)";
          ctx.lineWidth = 1.35;
          ctx.shadowColor = "rgba(255, 92, 53, 0.24)";
          ctx.shadowBlur = 8;
        } else {
          ctx.strokeStyle = `rgba(23, 24, 20, ${0.13 + this.seeds[index] * 0.16})`;
          ctx.lineWidth = 0.7 + this.seeds[index] * 0.45;
        }
        ctx.stroke();
        ctx.restore();

        if (index % 3 === 0) {
          [0.25, 0.74].forEach((amount, nodeIndex) => {
            const point = this.pointOnThread(index, amount, motionTime);
            ctx.beginPath();
            ctx.rect(point.x - 2.5, point.y - 2.5, 5, 5);
            ctx.fillStyle = nodeIndex === 0 ? "rgba(250, 248, 242, 0.95)" : "rgba(255, 92, 53, 0.86)";
            ctx.fill();
            ctx.strokeStyle = "rgba(23, 24, 20, 0.7)";
            ctx.lineWidth = 0.7;
            ctx.stroke();
          });
        }
      }
    }

    drawWeaveCells(motionTime) {
      const { ctx } = this;
      const crossings = [0.22, 0.36, 0.5, 0.64, 0.78];
      crossings.forEach((amount, railIndex) => {
        for (let index = railIndex % 2; index < this.threadCount; index += 4) {
          const point = this.pointOnThread(index, amount, motionTime);
          ctx.save();
          ctx.translate(point.x, point.y);
          ctx.rotate((railIndex % 2 ? -1 : 1) * 0.12);
          ctx.fillStyle = railIndex === 2 ? "rgba(255, 92, 53, 0.82)" : "rgba(250, 248, 242, 0.92)";
          ctx.fillRect(-4.5, -2.4, 9, 4.8);
          ctx.strokeStyle = "rgba(23, 24, 20, 0.48)";
          ctx.lineWidth = 0.6;
          ctx.strokeRect(-4.5, -2.4, 9, 4.8);
          ctx.restore();
        }
      });
    }

    drawPackets(motionTime) {
      const { ctx } = this;
      this.particles.forEach((particle, particleIndex) => {
        const progress = this.reducedMotion ? particle.phase : (particle.phase + motionTime * particle.speed) % 1;
        for (let trailIndex = 4; trailIndex >= 0; trailIndex -= 1) {
          const trailProgress = (progress - trailIndex * 0.009 + 1) % 1;
          const point = this.pointOnThread(particle.thread, trailProgress, motionTime);
          const next = this.pointOnThread(particle.thread, Math.min(1, trailProgress + 0.004), motionTime);
          const angle = Math.atan2(next.y - point.y, next.x - point.x);
          const strength = (5 - trailIndex) / 5;
          ctx.save();
          ctx.translate(point.x, point.y);
          ctx.rotate(angle);
          if (trailIndex === 0 && particle.accent) {
            ctx.shadowColor = "rgba(255, 92, 53, 0.85)";
            ctx.shadowBlur = 11;
          }
          ctx.fillStyle = particle.accent
            ? `rgba(255, 92, 53, ${0.18 + strength * 0.78})`
            : `rgba(23, 24, 20, ${0.08 + strength * 0.65})`;
          const width = trailIndex === 0 ? 8 : 3 + strength * 3;
          const height = trailIndex === 0 ? 4.2 : 1.6 + strength * 1.5;
          ctx.fillRect(-width * 0.5, -height * 0.5, width, height);
          ctx.restore();
        }

        if (particleIndex % 7 === 0) {
          const point = this.pointOnThread(particle.thread, progress, motionTime);
          const pulse = (motionTime * 0.75 + particle.phase) % 1;
          ctx.beginPath();
          ctx.arc(point.x, point.y, 5 + pulse * 9, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 92, 53, ${(1 - pulse) * 0.24})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      });
    }

    updateMetrics(motionTime) {
      const tick = Math.floor(motionTime * 1.35);
      if (tick === this.lastMetricTick) return;
      this.lastMetricTick = tick;
      if (this.latency) this.latency.textContent = `${78 + ((tick * 7) % 17)}ms`;
      if (this.trace) this.trace.textContent = ((0x7f3a + tick * 53) % 0xffff).toString(16).toUpperCase().padStart(4, "0");
    }

    draw(time) {
      if (!this.ctx || !this.width || !this.height) return;
      const elapsed = (time - this.startTime) / 1000;
      const motionTime = this.reducedMotion ? 2.4 : elapsed;

      this.motion.x += (this.targetMotion.x - this.motion.x) * 0.075;
      this.motion.y += (this.targetMotion.y - this.motion.y) * 0.075;
      this.motion.tiltX += (this.targetMotion.tiltX - this.motion.tiltX) * 0.075;
      this.motion.tiltY += (this.targetMotion.tiltY - this.motion.tiltY) * 0.075;

      const idleTilt = this.reducedMotion || this.pointerInside ? 0 : Math.sin(motionTime * 0.34) * 1.15;
      const idleLift = this.reducedMotion || this.pointerInside ? 0 : Math.sin(motionTime * 0.52) * 1.6;
      this.stage.style.setProperty("--loom-shift-x", `${this.motion.x.toFixed(2)}px`);
      this.stage.style.setProperty("--loom-shift-y", `${(this.motion.y + idleLift).toFixed(2)}px`);
      this.stage.style.setProperty("--loom-tilt-x", `${this.motion.tiltX.toFixed(2)}deg`);
      this.stage.style.setProperty("--loom-tilt-y", `${(this.motion.tiltY + idleTilt).toFixed(2)}deg`);
      this.stage.style.setProperty("--loom-parallax-x", `${(this.motion.x * 0.45).toFixed(2)}px`);
      this.stage.style.setProperty("--loom-parallax-y", `${(this.motion.y * 0.45).toFixed(2)}px`);
      this.stage.style.setProperty("--loom-parallax-back-x", `${(this.motion.x * -0.3).toFixed(2)}px`);
      this.stage.style.setProperty("--loom-parallax-back-y", `${(this.motion.y * -0.3).toFixed(2)}px`);
      this.stage.style.setProperty("--loom-parallax-mid-x", `${(this.motion.x * 0.38).toFixed(2)}px`);
      this.stage.style.setProperty("--loom-parallax-mid-y", `${(this.motion.y * 0.38).toFixed(2)}px`);
      this.stage.style.setProperty("--loom-parallax-front-x", `${(this.motion.x * 0.76).toFixed(2)}px`);
      this.stage.style.setProperty("--loom-parallax-front-y", `${(this.motion.y * 0.76).toFixed(2)}px`);

      this.ctx.clearRect(0, 0, this.width, this.height);
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";
      this.drawBackdrop(motionTime);
      this.drawThreads(motionTime);
      this.drawWeaveCells(motionTime);
      this.drawPackets(motionTime);
      this.updateMetrics(motionTime);
    }
  }

  const loomCanvas = document.getElementById("loomCanvas");
  const loomStage = document.getElementById("loomStage");
  if (loomCanvas && loomStage && "ResizeObserver" in window) {
    new ReliabilityLoom(loomCanvas, loomStage);
  }

})();
