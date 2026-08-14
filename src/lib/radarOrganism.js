import Matter from 'matter-js';

const { Bodies, Body, Composite, Engine } = Matter;

let activeOrganism = null;

export function destroyRadarOrganism() {
  if (!activeOrganism) return;
  window.cancelAnimationFrame(activeOrganism.frameId);
  window.clearTimeout(activeOrganism.resizeTimer);
  activeOrganism.resizeObserver?.disconnect();
  activeOrganism.stage.classList.remove('organism-active');
  activeOrganism.signals.forEach(({ element }) => {
    element.style.transform = '';
  });
  Composite.clear(activeOrganism.engine.world, false);
  Engine.clear(activeOrganism.engine);
  activeOrganism = null;
}

export function startRadarOrganism(root) {
  destroyRadarOrganism();

  const stage = root.querySelector('.ops-radar-stage');
  const radar = root.querySelector('.ops-radar-center');
  const elements = [...root.querySelectorAll('.ops-radar-signal')];
  if (!stage || !radar || !elements.length) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const stageRect = stage.getBoundingClientRect();
  const radarRect = radar.getBoundingClientRect();
  if (!stageRect.width || !stageRect.height) return;

  const engine = Engine.create({
    gravity: { x: 0, y: 0, scale: 0 },
    positionIterations: 8,
    velocityIterations: 6,
  });
  const wall = 80;
  const boundaries = [
    Bodies.rectangle(stageRect.width / 2, -wall / 2, stageRect.width + wall * 2, wall, { isStatic: true }),
    Bodies.rectangle(stageRect.width / 2, stageRect.height + wall / 2, stageRect.width + wall * 2, wall, { isStatic: true }),
    Bodies.rectangle(-wall / 2, stageRect.height / 2, wall, stageRect.height + wall * 2, { isStatic: true }),
    Bodies.rectangle(stageRect.width + wall / 2, stageRect.height / 2, wall, stageRect.height + wall * 2, { isStatic: true }),
  ];
  const radarCenter = {
    x: radarRect.left - stageRect.left + radarRect.width / 2,
    y: radarRect.top - stageRect.top + radarRect.height / 2,
  };
  const radarRadius = Math.max(72, radarRect.width * .2);
  const radarBody = Bodies.circle(radarCenter.x, radarCenter.y, radarRadius, {
    isStatic: true,
    restitution: 1,
  });

  const signals = elements.map((element, index) => {
    const rect = element.getBoundingClientRect();
    const origin = {
      x: rect.left - stageRect.left + rect.width / 2,
      y: rect.top - stageRect.top + rect.height / 2,
    };
    const body = Bodies.rectangle(origin.x, origin.y, rect.width + 8, rect.height + 8, {
      restitution: .96,
      friction: 0,
      frictionAir: .006,
      frictionStatic: 0,
      chamfer: { radius: Math.min(12, rect.height / 2) },
    });
    Body.setInertia(body, Infinity);
    const spawn = signalSpawnPosition(index, stageRect, radarCenter, radarRadius, rect);
    Body.setPosition(body, spawn);
    const deltaX = radarCenter.x - spawn.x;
    const deltaY = radarCenter.y - spawn.y;
    const distance = Math.max(1, Math.hypot(deltaX, deltaY));
    const speed = .54 + (index % 4) * .1;
    const tangent = index % 2 ? .2 : -.2;
    Body.setVelocity(body, {
      x: (deltaX / distance) * speed - (deltaY / distance) * tangent,
      y: (deltaY / distance) * speed + (deltaX / distance) * tangent,
    });
    return { body, element, origin };
  });

  Composite.add(engine.world, [...boundaries, radarBody, ...signals.map(({ body }) => body)]);
  stage.classList.add('organism-active');

  let previousTime = performance.now();
  let nextImpulseAt = previousTime + 900;
  const animate = (now) => {
    if (!activeOrganism || activeOrganism.engine !== engine || !stage.isConnected) return;
    const delta = Math.min(24, Math.max(8, now - previousTime));
    previousTime = now;
    Engine.update(engine, delta);

    if (now >= nextImpulseAt) {
      const target = signals[Math.floor(Math.random() * signals.length)];
      if (target) {
        Body.applyForce(target.body, target.body.position, {
          x: (Math.random() - .5) * target.body.mass * .0012,
          y: (Math.random() - .5) * target.body.mass * .0012,
        });
      }
      nextImpulseAt = now + 800 + Math.random() * 900;
    }

    signals.forEach(({ body, element, origin }) => {
      Body.setAngle(body, 0);
      Body.setAngularVelocity(body, 0);
      const speed = Math.hypot(body.velocity.x, body.velocity.y);
      if (speed > 1.15) {
        const scale = 1.15 / speed;
        Body.setVelocity(body, { x: body.velocity.x * scale, y: body.velocity.y * scale });
      } else if (speed < .18) {
        Body.applyForce(body, body.position, {
          x: (Math.random() - .5) * body.mass * .001,
          y: (Math.random() - .5) * body.mass * .001,
        });
      }
      const x = body.position.x - origin.x;
      const y = body.position.y - origin.y;
      element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    });

    activeOrganism.frameId = window.requestAnimationFrame(animate);
  };

  const resizeObserver = new ResizeObserver(() => {
    if (!activeOrganism || activeOrganism.engine !== engine) return;
    const widthChanged = Math.abs(stage.clientWidth - activeOrganism.width) > 2;
    const heightChanged = Math.abs(stage.clientHeight - activeOrganism.height) > 2;
    if (!widthChanged && !heightChanged) return;
    window.clearTimeout(activeOrganism.resizeTimer);
    activeOrganism.resizeTimer = window.setTimeout(() => {
      if (stage.isConnected) startRadarOrganism(root);
    }, 140);
  });

  activeOrganism = {
    engine,
    frameId: window.requestAnimationFrame(animate),
    resizeObserver,
    resizeTimer: 0,
    signals,
    stage,
    width: stage.clientWidth,
    height: stage.clientHeight,
  };
  resizeObserver.observe(stage);
}

function signalSpawnPosition(index, stageRect, radarCenter, radarRadius, rect) {
  const spots = [
    [.12, .16], [.82, .14], [.27, .34], [.73, .32], [.11, .62],
    [.87, .59], [.29, .82], [.72, .84], [.48, .12], [.52, .88],
  ];
  const [xRatio, yRatio] = spots[index % spots.length];
  const halfWidth = rect.width / 2 + 7;
  const halfHeight = rect.height / 2 + 7;
  const sidePadding = 12;
  const wallMinX = halfWidth + sidePadding;
  const wallMaxX = stageRect.width - halfWidth - sidePadding;
  const x = clampValue(stageRect.width * xRatio, wallMinX, wallMaxX);
  const y = clampValue(stageRect.height * yRatio, halfHeight + sidePadding, stageRect.height - halfHeight - sidePadding);
  const deltaX = x - radarCenter.x;
  const deltaY = y - radarCenter.y;
  const distance = Math.max(1, Math.hypot(deltaX, deltaY));
  const clearance = radarRadius + Math.hypot(halfWidth, halfHeight) + 10;
  if (distance >= clearance) return { x, y };
  return {
    x: clampValue(radarCenter.x + (deltaX / distance) * clearance, wallMinX, wallMaxX),
    y: clampValue(radarCenter.y + (deltaY / distance) * clearance, halfHeight + sidePadding, stageRect.height - halfHeight - sidePadding),
  };
}

function clampValue(value, min, max) {
  if (min > max) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}
