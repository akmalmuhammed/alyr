import { useEffect, useMemo, useRef, useState } from "react";
import { GlobeHemisphereWest } from "@phosphor-icons/react";
import createGlobe from "cobe";

const TAU = Math.PI * 2;
const DEFAULT_LOCATION = [25.2854, 51.531];
const IDLE_ROTATION_SPEED = 0.026;
const HORIZONTAL_SENSITIVITY = 0.0062;
const VERTICAL_SENSITIVITY = 0.0042;
const MAX_TILT = 0.78;

export function getGlobeScale(width, height) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const desiredDiameter = Math.min(safeWidth * 0.94, safeHeight * 0.9);
  return Math.min(
    1.13,
    Math.max(0.74, desiredDiameter / (safeHeight * 0.8)),
  );
}

function locationToAngles(lat, lng) {
  return [Math.PI - ((lng * Math.PI) / 180 - Math.PI / 2), (lat * Math.PI) / 180];
}

function shortestAngle(from, to) {
  return ((to - from + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

function clampTilt(value) {
  return Math.max(-MAX_TILT, Math.min(MAX_TILT, value));
}

function markerId(value) {
  const safeId = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `region-${safeId || "location"}`;
}

export function ContinuityGlobe({ regions, selectedId, onUnavailable }) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const globeRef = useRef(null);
  const frameRef = useRef(null);
  const invalidateRef = useRef(() => {});
  const dragRef = useRef(null);
  const initial = locationToAngles(...DEFAULT_LOCATION);
  const currentRef = useRef({ phi: initial[0], theta: initial[1] });
  const focusRef = useRef(initial);
  const activityRef = useRef({
    dragging: false,
    hovered: false,
    inertiaPhi: 0,
    inertiaTheta: 0,
    lastFrameTime: 0,
  });
  const [available, setAvailable] = useState(true);
  const unavailableRef = useRef(onUnavailable);
  unavailableRef.current = onUnavailable;

  const markers = useMemo(
    () =>
      regions.map((region) => {
        const selected = region.id === selectedId;
        const magnitude = Math.log2((region.assetCount || 0) + 1) * 0.006;
        return {
          id: markerId(region.id),
          location: [region.lat, region.lng],
          size: Math.min(0.075, 0.025 + magnitude + (selected ? 0.012 : 0)),
          color: selected ? [0.74, 0.48, 1] : [0.34, 0.82, 1],
        };
      }),
    [regions, selectedId],
  );

  const arcs = useMemo(() => {
    if (regions.length < 2) return [];
    const origin = regions.find((region) => region.id === selectedId) || regions[0];

    return regions
      .filter((region) => region.id !== origin.id)
      .slice(0, 5)
      .map((region, index) => ({
        id: `route-${markerId(origin.id)}-${markerId(region.id)}`,
        from: [origin.lat, origin.lng],
        to: [region.lat, region.lng],
        color: index === 0 ? [0.59, 0.43, 0.92] : [0.25, 0.62, 0.79],
      }));
  }, [regions, selectedId]);

  const markersRef = useRef(markers);
  const arcsRef = useRef(arcs);
  markersRef.current = markers;
  arcsRef.current = arcs;

  useEffect(() => {
    globeRef.current?.update({ markers, arcs });
    invalidateRef.current();
  }, [arcs, markers]);

  useEffect(() => {
    const region = regions.find((item) => item.id === selectedId);
    if (!region) return;
    focusRef.current = locationToAngles(region.lat, region.lng);
    activityRef.current.inertiaPhi = 0;
    activityRef.current.inertiaTheta = 0;
    invalidateRef.current();
  }, [regions, selectedId]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;

    const measure = () => {
      const rect = host.getBoundingClientRect();
      return {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
        dpr: Math.min(2, window.devicePixelRatio || 1),
      };
    };

    const reportUnavailable = () => {
      setAvailable(false);
      unavailableRef.current?.();
    };

    const first = measure();
    const handleContextLost = (event) => {
      event.preventDefault();
      reportUnavailable();
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);

    let globe;
    try {
      globe = createGlobe(canvas, {
        width: first.width,
        height: first.height,
        devicePixelRatio: first.dpr,
        phi: currentRef.current.phi,
        theta: currentRef.current.theta,
        dark: 1,
        diffuse: 1.6,
        mapSamples: first.width < 480 ? 24000 : 40000,
        mapBrightness: 5,
        mapBaseBrightness: 0.05,
        baseColor: [0.14, 0.3, 0.64],
        markerColor: [0.34, 0.82, 1],
        glowColor: [0.11, 0.56, 1],
        markers: markersRef.current,
        arcs: arcsRef.current,
        arcColor: [0.56, 0.42, 1],
        arcWidth: 0.72,
        arcHeight: 0.16,
        markerElevation: 0.055,
        scale: getGlobeScale(first.width, first.height),
        opacity: 1,
        offset: [0, 0],
        context: { alpha: true, antialias: true },
      });
    } catch {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      reportUnavailable();
      return undefined;
    }

    globeRef.current = globe;
    const handleResize = () => {
      const next = measure();
      globe.update({
        width: next.width,
        height: next.height,
        scale: getGlobeScale(next.width, next.height),
      });
    };
    const resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(handleResize)
        : null;
    if (resizeObserver) resizeObserver.observe(host);
    else window.addEventListener("resize", handleResize);

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    let destroyed = false;
    let inViewport = true;

    const render = (time) => {
      frameRef.current = null;
      if (destroyed || document.hidden || !inViewport) return;

      const current = currentRef.current;
      const activity = activityRef.current;
      const elapsed = activity.lastFrameTime
        ? Math.min(0.05, Math.max(0.001, (time - activity.lastFrameTime) / 1000))
        : 1 / 60;
      activity.lastFrameTime = time;

      const target = focusRef.current;
      if (target && !activity.dragging) {
        if (reducedMotion) {
          current.phi = target[0];
          current.theta = target[1];
          focusRef.current = null;
        } else {
          const phiDistance = shortestAngle(current.phi, target[0]);
          const thetaDistance = target[1] - current.theta;
          const focusEase = 1 - Math.exp(-6.5 * elapsed);
          current.phi += phiDistance * focusEase;
          current.theta += thetaDistance * focusEase;
          if (Math.abs(phiDistance) < 0.0008 && Math.abs(thetaDistance) < 0.0008) {
            focusRef.current = null;
          }
        }
      } else if (!activity.dragging && !reducedMotion) {
        const hasInertia =
          Math.abs(activity.inertiaPhi) > 0.002 ||
          Math.abs(activity.inertiaTheta) > 0.002;

        if (hasInertia) {
          current.phi += activity.inertiaPhi * elapsed;
          current.theta = clampTilt(current.theta + activity.inertiaTheta * elapsed);
          const decay = Math.exp(-4.6 * elapsed);
          activity.inertiaPhi *= decay;
          activity.inertiaTheta *= decay;
        } else {
          activity.inertiaPhi = 0;
          activity.inertiaTheta = 0;
          if (!activity.hovered) current.phi += IDLE_ROTATION_SPEED * elapsed;
        }
      }

      globe.update({ phi: current.phi, theta: current.theta });

      const shouldContinue =
        !reducedMotion ||
        Boolean(focusRef.current) ||
        activity.dragging ||
        Math.abs(activity.inertiaPhi) > 0.002 ||
        Math.abs(activity.inertiaTheta) > 0.002;
      if (shouldContinue) frameRef.current = requestAnimationFrame(render);
    };

    const start = () => {
      if (frameRef.current === null && !document.hidden && inViewport) {
        activityRef.current.lastFrameTime = 0;
        frameRef.current = requestAnimationFrame(render);
      }
    };
    invalidateRef.current = start;

    const handleVisibility = () => {
      if (document.hidden && frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      } else if (!document.hidden) {
        start();
      }
    };
    const handleMotion = () => {
      reducedMotion = motionQuery.matches;
      activityRef.current.inertiaPhi = 0;
      activityRef.current.inertiaTheta = 0;
      start();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    motionQuery.addEventListener("change", handleMotion);
    const intersectionObserver =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            ([entry]) => {
              inViewport = entry?.isIntersecting ?? true;
              if (!inViewport && frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
              } else if (inViewport) {
                start();
              }
            },
            { rootMargin: "120px" },
          )
        : null;
    intersectionObserver?.observe(host);
    start();

    return () => {
      destroyed = true;
      intersectionObserver?.disconnect();
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      document.removeEventListener("visibilitychange", handleVisibility);
      motionQuery.removeEventListener("change", handleMotion);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      invalidateRef.current = () => {};
      if (globeRef.current === globe) globeRef.current = null;
      globe.destroy();
    };
  }, []);

  function handlePointerDown(event) {
    if (dragRef.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocityPhi: 0,
      velocityTheta: 0,
      axis: "pending",
    };
    activityRef.current.inertiaPhi = 0;
    activityRef.current.inertiaTheta = 0;
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const totalX = event.clientX - drag.startX;
    const totalY = event.clientY - drag.startY;

    if (drag.axis === "pending") {
      if (Math.max(Math.abs(totalX), Math.abs(totalY)) < 7) return;
      if (Math.abs(totalY) > Math.abs(totalX)) {
        dragRef.current = null;
        return;
      }
      drag.axis = "horizontal";
      activityRef.current.dragging = true;
      focusRef.current = null;
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    const elapsed = Math.max(8, event.timeStamp - drag.lastTime) / 1000;
    const phiDelta = -dx * HORIZONTAL_SENSITIVITY;
    const thetaDelta = dy * VERTICAL_SENSITIVITY;

    currentRef.current.phi += phiDelta;
    currentRef.current.theta = clampTilt(currentRef.current.theta + thetaDelta);
    drag.velocityPhi = drag.velocityPhi * 0.55 + (phiDelta / elapsed) * 0.45;
    drag.velocityTheta = drag.velocityTheta * 0.55 + (thetaDelta / elapsed) * 0.45;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastTime = event.timeStamp;

    globeRef.current?.update({
      phi: currentRef.current.phi,
      theta: currentRef.current.theta,
    });
    invalidateRef.current();
  }

  function endPointer(event) {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      if (drag.axis === "horizontal") {
        activityRef.current.inertiaPhi = drag.velocityPhi;
        activityRef.current.inertiaTheta = drag.velocityTheta;
      }
      dragRef.current = null;
    }
    activityRef.current.dragging = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    invalidateRef.current();
  }

  if (!available) {
    return (
      <div className="globe-fallback" role="img" aria-label="Interactive globe unavailable">
        <GlobeHemisphereWest weight="duotone" />
        <strong>Globe view unavailable</strong>
        <span>Every location is still available in List view.</span>
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      className="globe-stage"
      data-globe-composition="full-orb"
      onPointerEnter={() => {
        activityRef.current.hovered = true;
      }}
      onPointerLeave={() => {
        activityRef.current.hovered = false;
        invalidateRef.current();
      }}
    >
      <canvas
        ref={canvasRef}
        className="globe-canvas"
        aria-hidden="true"
        draggable={false}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse" && dragRef.current?.axis === "pending") {
            dragRef.current = null;
          }
        }}
        onLostPointerCapture={() => {
          dragRef.current = null;
          activityRef.current.dragging = false;
          invalidateRef.current();
        }}
      />
    </div>
  );
}
