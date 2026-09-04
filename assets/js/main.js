(function () {
  var preloader = document.getElementById('preloader');

  // Absolute safety net: if GSAP's CDN fails outright, never leave the
  // visitor staring at a stuck white preloader screen — just remove it
  // and show the already-real (static, unanimated) page underneath.
  function killPreloaderInstantly() {
    if (preloader) preloader.parentNode.removeChild(preloader);
  }

  if (!window.gsap) {
    killPreloaderInstantly();
    return;
  }

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Scales every tween/stagger duration down to near-instant when the user
  // has asked the OS for reduced motion — GSAP tweens run on inline styles,
  // so the CSS `prefers-reduced-motion` fallback in style.css can't reach them.
  var d = function (seconds) {
    return reduceMotion ? 0.01 : seconds;
  };
  var st = function (seconds) {
    return reduceMotion ? 0 : seconds;
  };

  document.documentElement.classList.add('js-ready');

  gsap.set('.logo', { y: -24, opacity: 0 });
  gsap.set('.hero__tags', { opacity: 0, y: 16 });
  gsap.set('.hero__title .line', { y: 46, opacity: 0 });
  gsap.set('.hero__subtitle', { y: 14, opacity: 0 });
  gsap.set('.card', { y: 56, opacity: 0 });

  // The row rests with its first card cut in half at the left edge (not
  // flush/whole) from the very start, as a scroll affordance — a fixed
  // offset, not a random jump, and set this early (before the preloader
  // measures its flight targets or the marquee starts) so every part of
  // the sequence agrees on where the row actually sits from frame one.
  var firstCard = document.querySelector('.card');
  if (firstCard) {
    gsap.set('.work__track', { x: -firstCard.getBoundingClientRect().width / 2 });
  }

  /* -----------------------------------------------------------
     Entrance timeline — header, tags, headline, subtitle
     (called once the preloader hands off, see bottom of file)
  ----------------------------------------------------------- */

  function playIntro() {
    gsap
      .timeline({ defaults: { ease: 'power3.out' } })
      .to('.logo', { y: 0, opacity: 1, duration: d(0.9) })
      .to('.hero__tags', { opacity: 1, y: 0, duration: d(0.7) }, '-=' + d(0.5))
      .to(
        '.hero__title .line',
        { y: 0, opacity: 1, duration: d(0.9), stagger: st(0.12), ease: 'expo.out' },
        '-=' + d(0.35)
      )
      .to('.hero__subtitle', { opacity: 1, y: 0, duration: d(0.7) }, '-=' + d(0.45));
  }

  function revealCards() {
    gsap.to('.card', {
      y: 0,
      opacity: 1,
      duration: d(0.9),
      ease: 'power3.out',
      stagger: st(0.08),
      overwrite: true,
    });
  }

  /* -----------------------------------------------------------
     Seamless auto-scrolling marquees (tag pills + work cards)
     Each track renders its content twice back-to-back; looping
     the exact width of one copy via xPercent:-50 hides the seam.
     Both tracks are pointer-events:none (see style.css) so the
     mouse never interacts with or pauses them; skipped entirely
     under reduced-motion.
  ----------------------------------------------------------- */

  function createMarquee(trackSelector, pxPerSecond) {
    var track = document.querySelector(trackSelector);
    if (!track || reduceMotion) return null;

    var tween = null;

    function start() {
      if (tween) tween.kill();
      var groupWidth = track.scrollWidth / 2;
      var duration = groupWidth / pxPerSecond;
      tween = gsap.to(track, {
        xPercent: -50,
        duration: duration,
        ease: 'none',
        repeat: -1,
      });
    }

    return { start: start };
  }

  var tagsMarquee = createMarquee('.hero__tags__track', 45);
  var cardsMarquee = createMarquee('.work__track', 60);

  function startMarquees() {
    if (tagsMarquee) tagsMarquee.start();
    if (cardsMarquee) cardsMarquee.start();
  }

  // Re-measure the TAGS marquee once fonts/images finish sizing the
  // layout, since its track width (and so its duration/seam math)
  // depends on them. The cards marquee is deliberately left out of this
  // — it must not move .work__track at all until the preloader's photo
  // flight has landed (see the flight's onComplete further down), or a
  // load/fonts-ready firing mid-flight would drift the track's transform
  // out from under the still-flying photos' static target coordinates.
  window.addEventListener('load', function () {
    if (tagsMarquee) tagsMarquee.start();
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      if (tagsMarquee) tagsMarquee.start();
    });
  }

  /* -----------------------------------------------------------
     Preloader — real card photos deal into a center pile one at a
     time, hold, then each flies — along its own arc, straight from
     the pile — to the exact real position and size of its card's
     own image. These are the same elements the cards use, not
     stand-ins — the photo that lands IS the card's photo (its
     opacity is held at 0 until the instant the clone arrives, then
     they swap in a single frame at matching pixel coordinates, so
     nothing visibly cuts). Header, hero, and every card's band all
     reveal the moment the flight begins, so everything resolves as
     one motion.
  ----------------------------------------------------------- */

  var stack = document.getElementById('preloaderStack');
  var backdrop = document.getElementById('preloaderBackdrop');
  var sourceImgs = gsap.utils.toArray('.card__media img').slice(0, 5);

  function handoffToRealPage() {
    playIntro();
    revealCards();
    startMarquees();
  }

  // Header/hero/bands only — NOT the cards marquee. The flight targets a
  // position measured once, right as it starts; if the marquee were also
  // running during that ~1.2s flight, .work__track would keep drifting
  // (60px/s) out from under the now-static target the clones are flying
  // toward. So this fires at the 'flight' label, and the cards marquee is
  // started separately (see its onComplete) only once the photos land.
  function revealPageChrome() {
    playIntro();
    revealCards();
    if (tagsMarquee) tagsMarquee.start();
  }

  if (!preloader || !stack || !backdrop || reduceMotion || sourceImgs.length < 5) {
    killPreloaderInstantly();
    handoffToRealPage();
    return;
  }

  document.documentElement.classList.add('preloading');

  // The 5 involved cards reveal their band/shape with everyone else via
  // revealCards() below — but their own <img> stays invisible until the
  // instant its flying photo lands on top of it.
  gsap.set(sourceImgs, { opacity: 0 });

  // Hard safety net: this sequence has several moving parts (image loads,
  // a multi-step timeline, a manual FLIP). If anything in it throws or
  // stalls, the visitor must never be left with a locked scroll and a
  // stuck white screen — force everything to its resolved end-state.
  var handedOff = false;
  setTimeout(function () {
    if (handedOff) return;
    handedOff = true;
    gsap.killTweensOf([photos, stack, backdrop, preloader]);
    // Force every element's final visible state directly with gsap.set
    // (not .timeline/.to) first, so the page is guaranteed unstuck even
    // if handoffToRealPage()'s own animations below fail for the same
    // reason the main sequence did.
    gsap.set(sourceImgs, { opacity: 1 });
    gsap.set('.card', { y: 0, opacity: 1 });
    gsap.set('.logo', { y: 0, opacity: 1 });
    gsap.set('.hero__tags', { y: 0, opacity: 1 });
    gsap.set('.hero__title .line', { y: 0, opacity: 1 });
    gsap.set('.hero__subtitle', { y: 0, opacity: 1 });
    if (stack.parentNode) stack.parentNode.removeChild(stack);
    document.documentElement.classList.remove('preloading');
    preloader.style.display = 'none';
    try {
      handoffToRealPage();
    } catch (e) {
      // Visibility is already guaranteed above; the marquees/animations
      // are a bonus at this point, not load-bearing.
    }
  }, 9000);

  // A fixed, hand-tuned fan of offsets/rotations — deterministic on every
  // load so the "dealt pile" always reads cleanly, never an accidental
  // illegible overlap from raw randomness. Rotation stays subtle so the
  // bigger photos still read as a tidy stack, not a scattered mess.
  var PILE_ROTATION = [-7, 5, -4, 8, -6];
  var PILE_X = [-18, 20, -14, 10, -8];
  var PILE_Y = [-12, 16, -8, 14, -10];

  var photos = sourceImgs.map(function (sourceImg) {
    var wrap = document.createElement('div');
    wrap.className = 'preloader__photo';
    var img = document.createElement('img');
    // .src (not .currentSrc) — the real cards are loading="lazy" and may not
    // have started fetching yet, which would leave currentSrc empty.
    img.src = sourceImg.src;
    img.alt = '';
    wrap.appendChild(img);
    stack.appendChild(wrap);
    return wrap;
  });

  // Bigger, viewport-aware sizing — a plain two-step (mobile/desktop) scale
  // rather than a continuous formula, so the result stays predictable.
  var isMobile = window.innerWidth <= 720;
  var photoW = isMobile ? 190 : 300;
  var photoH = Math.round(photoW * 1.3);
  stack.style.setProperty('--photo-w', photoW + 'px');
  stack.style.setProperty('--photo-h', photoH + 'px');

  gsap.set(photos, {
    xPercent: -50,
    yPercent: -50,
    x: function (i) { return PILE_X[i]; },
    y: function (i) { return PILE_Y[i]; },
    rotation: function (i) { return PILE_ROTATION[i]; },
    scale: 0.6,
    opacity: 0,
    zIndex: function (i) { return i; },
  });

  function waitForImages(imgs, maxWaitMs) {
    return new Promise(function (resolve) {
      var remaining = imgs.length;
      var settled = false;
      function done() {
        if (settled) return;
        settled = true;
        resolve();
      }
      if (!remaining) {
        done();
        return;
      }
      imgs.forEach(function (img) {
        if (img.complete) {
          remaining -= 1;
          if (remaining <= 0) done();
          return;
        }
        img.addEventListener('load', tick, { once: true });
        img.addEventListener('error', tick, { once: true });
      });
      function tick() {
        remaining -= 1;
        if (remaining <= 0) done();
      }
      setTimeout(done, maxWaitMs);
    });
  }

  waitForImages(
    photos.map(function (p) { return p.querySelector('img'); }),
    1500
  ).then(function () {
    var tl = gsap.timeline();

    // 1. Deal the pile in one at a time — each photo pops in quickly,
    //    then holds fully visible alone for a beat before the next
    //    lands on top of it (stagger IS the hold: interval > duration).
    tl.to(photos, {
      opacity: 1,
      scale: 1,
      duration: 0.12,
      ease: 'power2.out',
      stagger: 0.2,
    }).to({}, { duration: 0.2 }); // the last photo gets its hold too

    // 2. Fly straight from the pile to each photo's exact real card
    //    position/size — no intermediate "row" stop — along a gentle arc
    //    rather than a straight line. GSAP's own bezier property tweens
    //    every target toward the SAME path, which doesn't work here since
    //    each of these 5 needs a distinct start/end, so the curve is
    //    stepped by hand each frame with a plain quadratic-bezier formula
    //    through a control point above the midpoint.
    tl.addLabel('flight').add(function () {
      // Work in CENTER-point coordinates, not box left/top: a rotated
      // element's getBoundingClientRect() reports its rotated bounding
      // box (bigger than the photo itself), but that box's CENTER is the
      // same as the element's true center regardless of rotation — so
      // this is the one measurement that's safe to read mid-rotation.
      // Position is then re-derived each frame as center minus half the
      // (also-animating) size, so nothing has to be un-rotated up front.
      var starts = photos.map(function (photo, i) {
        var r = photo.getBoundingClientRect();
        var s = {
          cx: r.left + r.width / 2,
          cy: r.top + r.height / 2,
          w: photoW,
          h: photoH,
          rot: PILE_ROTATION[i],
        };
        // Land on position:fixed with explicit left/top/rotation matching
        // this exact t=0 state in the SAME set() call — not just the
        // xPercent/x/y reset — so there's no frame where the box briefly
        // has no left/top override and jumps to viewport-center-relative
        // CSS top:50%/left:50% before the first onUpdate tick corrects it.
        gsap.set(photo, {
          position: 'fixed',
          xPercent: 0,
          yPercent: 0,
          x: 0,
          y: 0,
          left: s.cx - s.w / 2,
          top: s.cy - s.h / 2,
          width: s.w,
          height: s.h,
          rotation: s.rot,
        });
        return s;
      });

      var radius = isMobile ? 20 : 24;
      // The cards are still sitting at their pre-reveal y:56 offset here
      // (revealCards() below is what animates them up to y:0) — measuring
      // now would target 56px too low. Jump to the resting position just
      // long enough to measure (opacity is still 0, so it's invisible),
      // then restore the offset so revealCards() has its rise-up to animate.
      gsap.set('.card', { y: 0 });
      var targets = sourceImgs.map(function (img) {
        var t = img.parentElement.getBoundingClientRect();
        return { cx: t.left + t.width / 2, cy: t.top + t.height / 2, w: t.width, h: t.height };
      });
      gsap.set('.card', { y: 56 });

      // A little per-photo horizontal bias so the 5 arcs aren't identical.
      var ARC_BIAS = [-30, 20, -15, 25, -10];
      var arcHeight = isMobile ? 90 : 150;
      var flightsRemaining = photos.length;

      function land() {
        flightsRemaining -= 1;
        if (flightsRemaining > 0) return;
        if (handedOff) return; // the 9s safety net already forced things through
        handedOff = true;
        gsap.set(sourceImgs, { opacity: 1 });
        stack.parentNode.removeChild(stack);
        document.documentElement.classList.remove('preloading');
        // Only now, once every flight is truly finished — not when the
        // (slightly shorter) backdrop fade finishes — is it safe to hide
        // #preloader: it's the flying photos' own parent, so doing this
        // any earlier would cut their landing off mid-motion.
        preloader.style.display = 'none';
        // Only the cards marquee — not startMarquees()/tagsMarquee, which
        // is already running via revealPageChrome() and would visibly
        // restart/jump if re-triggered here for no reason.
        if (cardsMarquee) cardsMarquee.start();
      }

      photos.forEach(function (photo, i) {
        var start = starts[i];
        var end = targets[i];
        var control = {
          cx: (start.cx + end.cx) / 2 + (ARC_BIAS[i] || 0),
          cy: Math.min(start.cy, end.cy) - arcHeight,
        };
        var progress = { t: 0 };

        gsap.to(progress, {
          t: 1,
          duration: 1.05,
          ease: 'power2.inOut',
          delay: i * 0.03,
          onUpdate: function () {
            var t = progress.t;
            var mt = 1 - t;
            var cx = mt * mt * start.cx + 2 * mt * t * control.cx + t * t * end.cx;
            var cy = mt * mt * start.cy + 2 * mt * t * control.cy + t * t * end.cy;
            var w = start.w + (end.w - start.w) * t;
            var h = start.h + (end.h - start.h) * t;
            var r = radius * t;
            gsap.set(photo, {
              left: cx - w / 2,
              top: cy - h / 2,
              width: w,
              height: h,
              rotation: start.rot * mt, // eases to 0 as part of the same motion, no snap
              borderRadius: r.toFixed(1) + 'px ' + r.toFixed(1) + 'px 0 0',
            });
          },
          onComplete: land,
        });
      });
    }, 'flight');

    // Header, hero, and every card's band resolve at the same instant the
    // flight begins — the cards marquee itself waits (see onComplete above).
    tl.add(revealPageChrome, 'flight');

    // The backdrop clears while the photos are still mid-flight, so by
    // the time it's gone they've already landed on the real page.
    tl.to(backdrop, { opacity: 0, duration: 0.9, ease: 'power2.inOut' }, 'flight+=0.2');
  });
})();
