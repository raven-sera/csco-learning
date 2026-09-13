/* Static, illustrative geometry traced from the supplied Shandong floor images. */
(() => {
  'use strict';
  const T = window.THREE;
  const HEIGHTS = { main: 3.1, hall: 2.1, meeting: 1.55, vip: 1.8, public: 2.25 };

  class CscoVenueScene {
    constructor(container, labelLayer, geometry, project, onSelect, onError) {
      this.container = container;
      this.labelLayer = labelLayer;
      this.data = geometry;
      this.project = project;
      this.onSelect = onSelect;
      this.onError = onError;
      this.floor = 1;
      this.active = true;
      this.disposed = false;
      this.pendingFrame = 0;
      this.yaw = -0.65;
      this.pitch = 0.65;
      this.zoomFactor = 1;
      this.pointers = new Map();
      this.rooms = new Map();
      this.labels = [];
      this.events = [];
      this.floorGroups = {};
      this.roomMeshes = [];
      this.framingPoints = [];
      this.selected = new Set();
      this.scheduled = new Set();
      this.references = new Set();
      const style = getComputedStyle(container);
      this.colors = {
        selected: style.getPropertyValue('--ink').trim() || '#0c1b3a',
        scheduled: style.getPropertyValue('--lime').trim() || '#fcf150',
        reference: style.getPropertyValue('--coral').trim() || '#ec6749',
      };
      this.scene = new T.Scene();
      this.camera = new T.OrthographicCamera(-60, 60, 40, -40, 0.1, 700);
      this.raycaster = new T.Raycaster();
      this.pointer = new T.Vector2();
      this.scratch = new T.Vector3();
      try {
        this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setClearColor(0, 0);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = T.PCFSoftShadowMap;
        this.renderer.shadowMap.autoUpdate = false;
        this.renderer.outputColorSpace = T.SRGBColorSpace;
        this.renderer.toneMapping = T.ACESFilmicToneMapping;
        const canvas = this.renderer.domElement;
        canvas.tabIndex = 0;
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', '山东大厦立体会场图。方向键旋转，加减键缩放，Home 复位。使用地图下方的会场选择器选择会场。');
        container.append(canvas);
        this.scene.add(new T.HemisphereLight(0xffffff, 0xeef3fb, 1.7));
        const sun = new T.DirectionalLight(0xffffff, 2.1);
        sun.position.set(-30, 130, 35);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 1, far: 350 });
        sun.shadow.bias = -0.0004;
        sun.shadow.normalBias = 0.1;
        this.scene.add(sun);
        for (const floor of [1, 2]) this.buildFloor(floor);
        this.bindControls();
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(container);
        this.setFloor(1);
        this.resize();
      } catch (error) {
        this.dispose();
        throw error;
      }
    }

    shape(floor, points, holes = []) {
      const convert = pixel => {
        const [x, z] = this.project(floor, pixel);
        return new T.Vector2(x, -z);
      };
      const shape = new T.Shape(points.map(convert));
      for (const hole of holes) shape.holes.push(new T.Path(hole.map(convert)));
      return shape;
    }

    extrude(floor, polygon, height, materials, holes = [], bevel = false) {
      const geometry = new T.ExtrudeGeometry(this.shape(floor, polygon, holes), {
        depth: height, bevelEnabled: bevel, bevelSize: 0.12, bevelThickness: 0.09, bevelSegments: 1, steps: 1,
      });
      geometry.rotateX(-Math.PI / 2);
      const mesh = new T.Mesh(geometry, materials);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }

    label(text, floor, position, type = '', roomId = null) {
      const element = document.createElement('span');
      element.className = `venueMapLabel ${type}`;
      element.textContent = text;
      this.labelLayer.append(element);
      const label = { element, floor, position, roomId, type, width: 0, height: 0 };
      this.labels.push(label);
      return label;
    }

    buildFloor(floor) {
      const data = this.data.floors[floor];
      const group = new T.Group();
      this.floorGroups[floor] = group;
      this.scene.add(group);
      for (const polygon of [data.outline, ...data.extras]) {
        for (const pixel of polygon) {
          const [x, z] = this.project(floor, pixel);
          this.framingPoints.push({ floor, position: new T.Vector3(x, 0, z) });
        }
      }
      const slab = this.extrude(floor, data.outline, 0.7, [
        new T.MeshStandardMaterial({ color: 0xeef3fb, roughness: 0.95 }),
        new T.MeshStandardMaterial({ color: 0x9cabc4, roughness: 0.95 }),
      ], data.voids);
      slab.position.y = -0.7;
      group.add(slab);
      for (const polygon of data.extras) {
        group.add(this.extrude(floor, polygon, 0.7, [
          new T.MeshStandardMaterial({ color: 0xd7dfed, roughness: 0.9 }),
          new T.MeshStandardMaterial({ color: 0xeef3fb, roughness: 0.9 }),
        ]));
      }
      for (const room of this.data.rooms) {
        if (room.floor !== floor) continue;
        const color = this.data.categories[room.kind].color;
        const roof = new T.MeshStandardMaterial({ color, roughness: 0.85 });
        const wall = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
        const height = HEIGHTS[room.kind] || 1.55;
        const mesh = this.extrude(floor, room.polygon, height, [roof, wall], [], true);
        mesh.userData.roomId = room.id;
        group.add(mesh);
        this.roomMeshes.push(mesh);
        const outline = new T.LineLoop(
          new T.BufferGeometry().setFromPoints(room.polygon.map(pixel => {
            const [x, z] = this.project(floor, pixel);
            const point = new T.Vector3(x, height + 0.12, z);
            this.framingPoints.push({ floor, position: point });
            return point;
          })),
          new T.LineBasicMaterial({ color: 0xffffff }),
        );
        group.add(outline);
        const center = new T.Box3().setFromObject(mesh).getCenter(new T.Vector3());
        center.y = height + 0.9;
        const label = this.label(room.name, floor, center, '', room.id);
        this.rooms.set(room.id, { roof, wall, outline, label, color, kind: room.kind });
      }
      if (floor === this.data.entrance.floor) {
        const [x, z] = this.project(floor, this.data.entrance.pixel);
        const marker = new T.Mesh(new T.CylinderGeometry(0.65, 0.65, 0.2, 24), new T.MeshStandardMaterial({ color: this.colors.selected }));
        marker.position.set(x, 0.2, z);
        group.add(marker);
        this.label('会议中心入口', floor, new T.Vector3(x, 1.3, z), 'isEntrance');
      }
      const bounds = new T.Box3().setFromObject(group);
      this.label(`${floor}F`, floor, new T.Vector3(bounds.min.x, 1, bounds.max.z), 'isFloor');
    }

    setFloor(floor) {
      this.floor = floor;
      const all = floor === 'all';
      this.floorGroups[1].visible = all || floor === 1;
      this.floorGroups[2].visible = all || floor === 2;
      this.floorGroups[2].position.set(0, all ? 46 : 0, 0);
      this.bounds = new T.Box3();
      for (const group of Object.values(this.floorGroups)) if (group.visible) this.bounds.union(new T.Box3().setFromObject(group));
      this.target = this.bounds.getCenter(new T.Vector3());
      this.renderer.shadowMap.needsUpdate = true;
      this.updateCamera();
    }

    setSelection(selected, scheduled, references) {
      this.selected = new Set(selected);
      this.scheduled = new Set(scheduled);
      this.references = new Set(references);
      for (const [id, room] of this.rooms) {
        const chosen = this.selected.has(id);
        const scheduledRoom = this.scheduled.has(id);
        const reference = this.references.has(id);
        room.roof.color.set(chosen ? this.colors.selected : reference ? this.colors.reference : scheduledRoom ? this.colors.scheduled : room.color);
        room.outline.material.color.set(chosen ? this.colors.scheduled : reference ? this.colors.reference : '#ffffff');
        room.label.element.classList.toggle('isSelected', chosen);
        room.label.element.classList.toggle('isScheduled', scheduledRoom && !chosen);
        room.label.element.classList.toggle('isReference', reference && !chosen);
        room.label.width = 0;
      }
      this.renderSoon();
    }

    resize() {
      if (this.disposed || !this.active) return;
      this.width = this.container.clientWidth;
      this.height = this.container.clientHeight;
      if (!this.width || !this.height) return;
      this.renderer.setSize(this.width, this.height);
      for (const label of this.labels) label.width = 0;
      this.updateCamera();
    }

    setActive(active) {
      this.active = active;
      if (active) this.resize();
      else if (this.pendingFrame) {
        cancelAnimationFrame(this.pendingFrame);
        this.pendingFrame = 0;
      }
    }

    updateCamera() {
      if (!this.width || !this.height || !this.bounds) return;
      const pitch = this.pitch;
      this.camera.position.set(
        this.target.x + Math.sin(this.yaw) * Math.cos(pitch) * 220,
        this.target.y + Math.sin(pitch) * 220,
        this.target.z + Math.cos(this.yaw) * Math.cos(pitch) * 220,
      );
      this.camera.lookAt(this.target);
      this.camera.updateMatrixWorld();
      let extentX = 0, extentY = 0;
      // Project the traced footprint, not the empty corners of a world-axis box.
      for (const point of this.framingPoints) {
        const group = this.floorGroups[point.floor];
        if (!group.visible) continue;
        this.scratch.copy(point.position).add(group.position).applyMatrix4(this.camera.matrixWorldInverse);
        extentX = Math.max(extentX, Math.abs(this.scratch.x));
        extentY = Math.max(extentY, Math.abs(this.scratch.y));
      }
      const aspect = this.width / this.height;
      const halfHeight = Math.max(extentY + 4, (extentX + 5) / aspect) / this.zoomFactor;
      this.camera.left = -halfHeight * aspect;
      this.camera.right = halfHeight * aspect;
      this.camera.top = halfHeight;
      this.camera.bottom = -halfHeight;
      this.camera.updateProjectionMatrix();
      this.renderSoon();
    }

    zoom(factor) {
      this.zoomFactor = T.MathUtils.clamp(this.zoomFactor * factor, 0.6, 3.5);
      this.updateCamera();
    }

    reset() {
      this.yaw = -0.65;
      this.pitch = 0.65;
      this.zoomFactor = 1;
      this.updateCamera();
    }

    listen(target, name, listener, options) {
      target.addEventListener(name, listener, options);
      this.events.push(() => target.removeEventListener(name, listener, options));
    }

    bindControls() {
      const canvas = this.renderer.domElement;
      this.listen(canvas, 'pointerdown', event => {
        if (event.button !== 0) return;
        canvas.focus({ preventScroll: true });
        canvas.setPointerCapture(event.pointerId);
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.pointers.size === 1) this.drag = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
        else {
          this.drag.moved = true;
          this.pinchDistance = this.pointerDistance();
        }
      });
      this.listen(canvas, 'pointermove', event => {
        if (!this.pointers.has(event.pointerId)) return;
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.pointers.size >= 2) {
          const distance = this.pointerDistance();
          if (this.pinchDistance > 0) this.zoom(distance / this.pinchDistance);
          this.pinchDistance = distance;
          return;
        }
        const drag = this.drag;
        if (!drag) return;
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5) drag.moved = true;
        if (drag.moved) {
          this.yaw -= (event.clientX - drag.x) * 0.006;
          this.pitch = T.MathUtils.clamp(this.pitch + (event.clientY - drag.y) * 0.004, 0.28, 1.48);
          this.updateCamera();
        }
        drag.x = event.clientX;
        drag.y = event.clientY;
      });
      const release = event => {
        if (!this.pointers.has(event.pointerId)) return;
        const pick = event.type === 'pointerup' && this.pointers.size === 1 && this.drag && !this.drag.moved;
        this.pointers.delete(event.pointerId);
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        if (pick) this.pick(event.clientX, event.clientY);
        if (this.pointers.size === 1) {
          const point = this.pointers.values().next().value;
          this.drag = { ...point, startX: point.x, startY: point.y, moved: true };
        } else if (!this.pointers.size) this.drag = null;
      };
      this.listen(canvas, 'pointerup', release);
      this.listen(canvas, 'pointercancel', release);
      this.listen(canvas, 'lostpointercapture', release);
      this.listen(canvas, 'wheel', event => {
        event.preventDefault();
        this.zoom(Math.exp(-event.deltaY * 0.001));
      }, { passive: false });
      this.listen(canvas, 'keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'].includes(event.key)) return;
        event.preventDefault();
        if (event.key === 'ArrowLeft') this.yaw += 0.12;
        if (event.key === 'ArrowRight') this.yaw -= 0.12;
        if (event.key === 'ArrowUp') this.pitch = Math.min(1.48, this.pitch + 0.1);
        if (event.key === 'ArrowDown') this.pitch = Math.max(0.28, this.pitch - 0.1);
        if (event.key === '+' || event.key === '=') this.zoom(1.15);
        else if (event.key === '-') this.zoom(1 / 1.15);
        else if (event.key === 'Home') this.reset();
        else this.updateCamera();
      });
      this.listen(canvas, 'webglcontextlost', event => {
        event.preventDefault();
        this.setActive(false);
        this.onError('立体地图的图形连接已中断，已切换到可点击的原图。');
      });
    }

    pointerDistance() {
      const iterator = this.pointers.values();
      const a = iterator.next().value, b = iterator.next().value;
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    pick(x, y) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      this.scene.updateMatrixWorld(true);
      const hit = this.raycaster.intersectObjects(this.roomMeshes.filter(mesh => mesh.parent.visible), false)[0];
      if (hit) this.onSelect(hit.object.userData.roomId);
    }

    renderSoon() {
      if (this.disposed || !this.active || this.pendingFrame) return;
      this.pendingFrame = requestAnimationFrame(() => {
        this.pendingFrame = 0;
        if (this.disposed || !this.active || !this.width || !this.height) return;
        try {
          this.renderer.render(this.scene, this.camera);
          this.updateLabels();
        } catch {
          this.setActive(false);
          this.onError('立体地图暂不可用，已切换到可点击的原图。');
        }
      });
    }

    updateLabels() {
      const candidates = [];
      for (const label of this.labels) {
        const group = this.floorGroups[label.floor];
        if (!group.visible || (label.type === 'isFloor' && this.floor !== 'all')) {
          label.element.style.display = 'none';
          continue;
        }
        this.scratch.copy(label.position).add(group.position).project(this.camera);
        const x = (this.scratch.x + 1) * this.width / 2;
        const y = (1 - this.scratch.y) * this.height / 2;
        if (x < 0 || x > this.width || y < 0 || y > this.height) {
          label.element.style.display = 'none';
          continue;
        }
        label.element.style.display = '';
        if (!label.width) {
          label.width = label.element.offsetWidth;
          label.height = label.element.offsetHeight;
        }
        const priority = this.selected.has(label.roomId) ? 100 : label.type ? 80 : this.references.has(label.roomId) ? 70 : this.scheduled.has(label.roomId) ? 60 : this.rooms.get(label.roomId)?.kind === 'main' ? 50 : 20;
        candidates.push({ label, x: T.MathUtils.clamp(x, label.width / 2 + 4, this.width - label.width / 2 - 4), y, priority });
      }
      candidates.sort((a, b) => b.priority - a.priority);
      const occupied = [];
      for (const { label, x, y, priority } of candidates) {
        const rect = { left: x - label.width / 2 - 2, right: x + label.width / 2 + 2, top: y - label.height / 2 - 2, bottom: y + label.height / 2 + 2 };
        let overlap = occupied.some(other => rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top);
        // Keep neighboring selected halls legible instead of hiding either label.
        for (let step = 1; overlap && priority === 100 && step <= 8; step++) {
          const offset = Math.ceil(step / 2) * (label.height + 5) * (step % 2 ? -1 : 1);
          rect.top = T.MathUtils.clamp(y + offset - label.height / 2 - 2, 2, this.height - label.height - 6);
          rect.bottom = rect.top + label.height + 4;
          overlap = occupied.some(other => rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top);
        }
        label.element.style.visibility = overlap && priority < 100 ? 'hidden' : 'visible';
        label.element.style.transform = `translate(${x - label.width / 2}px,${rect.top + 2}px)`;
        if (!overlap || priority === 100) occupied.push(rect);
      }
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      cancelAnimationFrame(this.pendingFrame);
      this.pendingFrame = 0;
      this.resizeObserver?.disconnect();
      for (const remove of this.events) remove();
      this.events.length = 0;
      if (this.renderer) {
        const canvas = this.renderer.domElement;
        for (const id of this.pointers.keys()) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      }
      this.pointers.clear();
      const geometries = new Set(), materials = new Set(), textures = new Set();
      this.scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        if (object.shadow) object.shadow.dispose();
      });
      for (const material of materials) {
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        material.dispose();
      }
      for (const geometry of geometries) geometry.dispose();
      for (const texture of textures) texture.dispose();
      for (const label of this.labels) label.element.remove();
      this.labels.length = 0;
      this.rooms.clear();
      this.roomMeshes.length = 0;
      this.framingPoints.length = 0;
      this.scene.clear();
      if (this.renderer) {
        this.renderer.renderLists.dispose();
        this.renderer.dispose();
        this.renderer.forceContextLoss();
        this.renderer.domElement.remove();
      }
    }
  }
  window.CscoVenueScene = CscoVenueScene;
})();
