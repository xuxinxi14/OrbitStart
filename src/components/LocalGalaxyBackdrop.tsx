import { localGalaxyAssets } from "../theme/localGalaxyAssets";

interface LocalGalaxyBackdropProps {
  mainOpacity?: number;
  nebulaOpacity?: number;
  starOpacity?: number;
  topGlowOpacity?: number;
  orbitOpacity?: number;
  showOrbitLayer?: boolean;
}

export function LocalGalaxyBackdrop({
  mainOpacity = 0.82,
  nebulaOpacity = 0.16,
  starOpacity = 0.16,
  topGlowOpacity = 0.14,
  orbitOpacity = 0.08,
  showOrbitLayer = true
}: LocalGalaxyBackdropProps) {
  return (
    <div className="local-galaxy-backdrop" aria-hidden="true">
      <img
        className="galaxy-layer galaxy-layer-main"
        src={localGalaxyAssets.backgrounds.main.src}
        alt=""
        style={{ opacity: mainOpacity }}
      />
      <img
        className="galaxy-layer galaxy-layer-nebula"
        src={localGalaxyAssets.backgrounds.nebula.src}
        alt=""
        style={{ opacity: nebulaOpacity }}
      />
      <img
        className="galaxy-layer galaxy-layer-stars"
        src={localGalaxyAssets.textures.stars.src}
        alt=""
        style={{ opacity: starOpacity }}
      />
      <img
        className="galaxy-layer galaxy-layer-top-flow"
        src={localGalaxyAssets.effects.topFlow.src}
        alt=""
        style={{ opacity: topGlowOpacity }}
      />
      {showOrbitLayer && (
        <img
          className="galaxy-layer galaxy-layer-orbit"
          src={localGalaxyAssets.ornaments.orbit.src}
          alt=""
          style={{ opacity: orbitOpacity }}
        />
      )}
    </div>
  );
}
