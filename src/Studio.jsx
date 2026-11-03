import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
export default function Studio({ product, user, api, notify, onClose }) {
  const host = useRef(),
    engine = useRef();
  const [photo, setPhoto] = useState(null),
    [scale, setScale] = useState(1),
    [rotation, setRotation] = useState(0),
    [name, setName] = useState("Bahçem"),
    [position, setPosition] = useState({ x: 0, y: 0 }),
    [saved, setSaved] = useState([]);
  useEffect(() => {
    if (user)
      api("/api/designs")
        .then(setSaved)
        .catch((e) => notify(e.message));
  }, [user]);
  useEffect(() => {
    const el = host.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      notify("3D görüntüleme için WebGL destekli tarayıcı gerekli.");
      return;
    }
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 3, 8);
    camera.lookAt(0, 0, 0);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6d6957, 3));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(3, 5, 4);
    scene.add(light);
    const group = new THREE.Group();
    scene.add(group);
    const wood = new THREE.MeshStandardMaterial({
        color: product.color || "#b79b77",
        roughness: 0.85,
      }),
      fabric = new THREE.MeshStandardMaterial({
        color: "#eee6d9",
        roughness: 1,
      });
    const box = (w, h, d, x, y, z, mat = wood) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      group.add(m);
    };
    const table = product.category === "Masalar";
    const sofa = product.category === "Oturma Grupları";
    const lounger = product.category === "Şezlonglar";
    const w = sofa ? 2.6 : table ? 2.7 : 1.2,
      d = lounger ? 2.5 : table ? 1.6 : 1.15;
    box(w, 0.15, d, 0, 0, 0);
    for (const x of [-w / 2 + 0.12, w / 2 - 0.12])
      for (const z of [-d / 2 + 0.12, d / 2 - 0.12])
        box(0.12, 0.8, 0.12, x, -0.45, z);
    if (!table) {
      box(w - 0.12, 0.2, d - 0.12, 0, 0.16, 0, fabric);
      box(w, 0.85, 0.12, 0, 0.5, -d / 2);
      box(w - 0.15, 0.65, 0.17, 0, 0.5, -d / 2 + 0.1, fabric);
      for (const x of [-w / 2, w / 2]) box(0.12, 0.45, d, x, 0.3, 0);
      if (sofa)
        for (const x of [-0.82, 0, 0.82])
          box(0.76, 0.15, 0.94, x, 0.29, 0.02, fabric);
    }
    group.rotation.y = 0.4;
    let frame;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      renderer.render(scene, camera);
    };
    draw();
    const resize = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    resize.observe(el);
    engine.current = group;
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      scene.traverse((o) => {
        o.geometry?.dispose();
      });
      wood.dispose();
      fabric.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      engine.current = null;
    };
  }, [product]);
  useEffect(() => {
    if (engine.current) {
      engine.current.scale.setScalar(scale);
      engine.current.rotation.y = (rotation * Math.PI) / 180 + 0.4;
      engine.current.position.set(position.x, position.y, 0);
    }
  }, [scale, rotation, position]);
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo);
    },
    [photo],
  );
  const upload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (
      !["image/jpeg", "image/png"].includes(file.type) ||
      file.size > 8 * 1024 * 1024
    )
      return notify("En fazla 8 MB JPEG veya PNG seçin");
    setPhoto(URL.createObjectURL(file));
  };
  const drag = useRef(null);
  return (
    <div className="overlay">
      <section
        className="studio modal"
        role="dialog"
        aria-modal="true"
        aria-label="3D tasarım stüdyosu"
      >
        <header>
          <div>
            <span className="eyebrow">BAHÇENİ TASARLA / 3D STÜDYO</span>
            <h2>Hayal et. Yerleştir. Yaşa.</h2>
          </div>
          <button onClick={onClose} className="icon" aria-label="Kapat">
            ×
          </button>
        </header>
        <div className="studio-body">
          <div
            className="scene"
            style={{
              backgroundImage: `url(${photo || "/images/garden-hero.png"})`,
            }}
            onPointerDown={(e) => {
              drag.current = { x: e.clientX, y: e.clientY, p: position };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (drag.current)
                setPosition({
                  x: drag.current.p.x + (e.clientX - drag.current.x) / 90,
                  y: drag.current.p.y - (e.clientY - drag.current.y) / 90,
                });
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            <div ref={host} className="canvas-host" />
            <span className="scene-note">
              Mobilyayı sürükleyerek yerleştirin
            </span>
          </div>
          <aside>
            <h3>{product.name}</h3>
            <p>
              Fotoğrafınızın üzerinde gerçek zamanlı 3D önizleme. Model
              temsilidir; ölçü ve renkler yaklaşık görünür.
            </p>
            <label className="upload">
              ↥ Bahçe fotoğrafı yükle
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={upload}
              />
            </label>
            <label>
              Boyut{" "}
              <input
                type="range"
                min=".2"
                max="3"
                step=".05"
                value={scale}
                onChange={(e) => setScale(+e.target.value)}
              />
            </label>
            <label>
              Döndürme · {rotation}°
              <input
                type="range"
                min="0"
                max="360"
                value={rotation}
                onChange={(e) => setRotation(+e.target.value)}
              />
            </label>
            <button
              className="text-btn"
              onClick={() => {
                setScale(1);
                setRotation(0);
                setPosition({ x: 0, y: 0 });
              }}
            >
              Yerleşimi sıfırla
            </button>
            <label>
              Tasarım adı
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <button
              className="primary"
              onClick={async () => {
                try {
                  if (!user)
                    return notify("Tasarım kaydetmek için giriş yapın");
                  const d = await api("/api/designs", {
                    method: "POST",
                    body: JSON.stringify({
                      name,
                      productId: product._id,
                      ...position,
                      scale,
                      rotation,
                    }),
                  });
                  setSaved([...saved, d]);
                  notify("Yerleşim kaydedildi. Fotoğraf cihazınızda kalır.");
                } catch (e) {
                  notify(e.message);
                }
              }}
            >
              Yerleşimimi kaydet
            </button>
            {saved
              .filter((d) => d.productId === product._id)
              .map((d) => (
                <button
                  key={d._id}
                  className="saved"
                  onClick={() => {
                    setPosition({ x: d.x, y: d.y });
                    setScale(d.scale);
                    setRotation(d.rotation);
                    setName(d.name);
                  }}
                >
                  {d.name} ↗
                </button>
              ))}
            <small>
              Gizlilik için bahçe fotoğrafı sunucuya gönderilmez. Kaydedilen
              yerleşimi açarken fotoğrafı yeniden seçebilirsiniz.
            </small>
          </aside>
        </div>
      </section>
    </div>
  );
}
