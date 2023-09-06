import * as Kalidokit from "../dist";
//Import Helper Functions from Kalidokit
const remap = Kalidokit.Utils.remap;
const clamp = Kalidokit.Utils.clamp;
const lerp = Kalidokit.Vector.lerp;

/* THREEJS WORLD SETUP */
// 渲染后的3d图像显示设置
let currentVrm;

// renderer
// 渲染器设置
const renderer = new THREE.WebGLRenderer({alpha: true});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// camera
// （显示）视角设置
const orbitCamera = new THREE.PerspectiveCamera(35,
    window.innerWidth / window.innerHeight, 0.1, 1000);
orbitCamera.position.set(0.0, 1.4, 0.7);

// controls
// 相机控制 旋转 平移
const orbitControls = new THREE.OrbitControls(orbitCamera, renderer.domElement);
orbitControls.screenSpacePanning = true;
orbitControls.target.set(0.0, 1.4, 0.0);
orbitControls.update();

// scene
// 场景
const scene = new THREE.Scene();

// light
// 光源设置
const light = new THREE.DirectionalLight(0xffffff);
light.position.set(1.0, 1.0, 1.0).normalize();
scene.add(light);

// Main Render Loop
// 主渲染器循环
const clock = new THREE.Clock();

// 动画
function animate() {
  requestAnimationFrame(animate);

  if (currentVrm) {
    // Update model to render physics
    // 更新渲染器vrm模型
    currentVrm.update(clock.getDelta());
  }
  renderer.render(scene, orbitCamera);
}

animate();

/* VRM CHARACTER SETUP */
// vrm 模型特征设置
// Import Character VRM
// 加载3d模型
const loader = new THREE.GLTFLoader();
loader.crossOrigin = "anonymous";
// Import model from URL, add your own model here
loader.load(
    "https://cdn.glitch.com/29e07830-2317-4b15-a044-135e73c7f840%2FAshtra.vrm?v=1630342336981",

    (gltf) => {
      THREE.VRMUtils.removeUnnecessaryJoints(gltf.scene);  // 移除不使用的关节点

      THREE.VRM.from(gltf).then((vrm) => {
        scene.add(vrm.scene);
        currentVrm = vrm;
        currentVrm.scene.rotation.y = Math.PI; // Rotate model 180deg to face camera  y轴旋转180°
      });
    },
    // 计算模型加载进度
    (progress) => console.log("Loading model...",
        100.0 * (progress.loaded / progress.total), "%"),
    // 打印错误信息
    (error) => console.error(error)
);

// Animate Rotation Helper function
// 动画旋转辅助函数  dampener：平滑参数
const rigRotation = (name, rotation = {x: 0, y: 0, z: 0}, dampener = 1,
    lerpAmount = 0.3) => {
  if (!currentVrm) {
    return;
  }
  // 根据名称获得躯干
  const Part = currentVrm.humanoid.getBoneNode(
      THREE.VRMSchema.HumanoidBoneName[name]);
  if (!Part) {
    return;
  }
  // 欧拉角
  let euler = new THREE.Euler(
      rotation.x * dampener,
      rotation.y * dampener,
      rotation.z * dampener,
      rotation.rotationOrder || "XYZ"
  );
  let quaternion = new THREE.Quaternion().setFromEuler(euler);
  Part.quaternion.slerp(quaternion, lerpAmount); // interpolate 球面线性插值
};

// Animate Position Helper Function
// 动画位置计算辅助函数
const rigPosition = (name, position = {x: 0, y: 0, z: 0}, dampener = 1,
    lerpAmount = 0.3) => {
  if (!currentVrm) {
    return;
  }
  const Part = currentVrm.humanoid.getBoneNode(
      THREE.VRMSchema.HumanoidBoneName[name]);
  if (!Part) {
    return;
  }
  // 向量
  let vector = new THREE.Vector3(position.x * dampener, position.y * dampener,
      position.z * dampener);
  Part.position.lerp(vector, lerpAmount); // interpolate
};

let oldLookTarget = new THREE.Euler();
// 操控人脸
const rigFace = (riggedFace) => {
  if (!currentVrm) {
    return;
  }
  rigRotation("Neck", riggedFace.head, 0.7);

  // Blendshapes and Preset Name Schema
  const Blendshape = currentVrm.blendShapeProxy;
  const PresetName = THREE.VRMSchema.BlendShapePresetName;

  // Simple example without winking. Interpolate based on old blendshape, then stabilize blink with `Kalidokit` helper function.
  // 插值 保证眨眼动作的流畅
  // for VRM, 1 is closed, 0 is open.
  // vrm 模型中 眼睛1是闭眼 0是睁眼
  riggedFace.eye.l = lerp(clamp(1 - riggedFace.eye.l, 0, 1),
      Blendshape.getValue(PresetName.Blink), 0.5);
  riggedFace.eye.r = lerp(clamp(1 - riggedFace.eye.r, 0, 1),
      Blendshape.getValue(PresetName.Blink), 0.5);
  riggedFace.eye = Kalidokit.Face.stabilizeBlink(riggedFace.eye,
      riggedFace.head.y);
  Blendshape.setValue(PresetName.Blink, riggedFace.eye.l);

  // Interpolate and set mouth blendshapes
  // 插值和嘴巴形状设置
  Blendshape.setValue(PresetName.I,
      lerp(riggedFace.mouth.shape.I, Blendshape.getValue(PresetName.I), 0.5));
  Blendshape.setValue(PresetName.A,
      lerp(riggedFace.mouth.shape.A, Blendshape.getValue(PresetName.A), 0.5));
  Blendshape.setValue(PresetName.E,
      lerp(riggedFace.mouth.shape.E, Blendshape.getValue(PresetName.E), 0.5));
  Blendshape.setValue(PresetName.O,
      lerp(riggedFace.mouth.shape.O, Blendshape.getValue(PresetName.O), 0.5));
  Blendshape.setValue(PresetName.U,
      lerp(riggedFace.mouth.shape.U, Blendshape.getValue(PresetName.U), 0.5));

  //PUPILS
  // 瞳孔
  //interpolate pupil and keep a copy of the value
  let lookTarget = new THREE.Euler(
      lerp(oldLookTarget.x, riggedFace.pupil.y, 0.4),
      lerp(oldLookTarget.y, riggedFace.pupil.x, 0.4),
      0,
      "XYZ"
  );
  oldLookTarget.copy(lookTarget);
  currentVrm.lookAt.applyer.lookAt(lookTarget);
};

/* VRM Character Animator */
// vrm 特征动画
const animateVRM = (vrm, results) => {
  if (!vrm) {
    return;
  }
  // Take the results from `Holistic` and animate character based on its Face, Pose, and Hand Keypoints.
  let riggedPose, riggedLeftHand, riggedRightHand, riggedFace;

  const faceLandmarks = results.faceLandmarks;
  // Pose 3D Landmarks are with respect to Hip distance in meters
  // 姿势3D标志与髋关节距离相关，单位为米
  const pose3DLandmarks = results.ea;
  // Pose 2D landmarks are with respect to videoWidth and videoHeight
  // 姿势2D标志与视频宽高有关
  const pose2DLandmarks = results.poseLandmarks;
  // Be careful, hand landmarks may be reversed
  // 左右手进行镜像
  const leftHandLandmarks = results.rightHandLandmarks;
  const rightHandLandmarks = results.leftHandLandmarks;

  // Animate Face
  // 脸部动画
  if (faceLandmarks) {
    riggedFace = Kalidokit.Face.solve(faceLandmarks, {
      runtime: "mediapipe",
      video: videoElement,
    });
    rigFace(riggedFace);
  }

  // Animate Pose
  // 动作动画
  if (pose2DLandmarks && pose3DLandmarks) {
    riggedPose = Kalidokit.Pose.solve(pose3DLandmarks, pose2DLandmarks, {
      runtime: "mediapipe",
      video: videoElement,
    });
    // 臀部旋转
    rigRotation("Hips", riggedPose.Hips.rotation, 0.7);
    rigPosition(
        "Hips",
        {
          x: riggedPose.Hips.position.x, // Reverse direction
          y: riggedPose.Hips.position.y + 1, // Add a bit of height
          z: -riggedPose.Hips.position.z, // Reverse direction
        },
        1,
        0.07
    );
    // 胸部
    rigRotation("Chest", riggedPose.Spine, 0.25, 0.3);
    // 脊柱
    rigRotation("Spine", riggedPose.Spine, 0.45, 0.3);

    // 右上臂
    rigRotation("RightUpperArm", riggedPose.RightUpperArm, 1, 0.3);
    // 右下臂
    rigRotation("RightLowerArm", riggedPose.RightLowerArm, 1, 0.3);
    // 左上臂
    rigRotation("LeftUpperArm", riggedPose.LeftUpperArm, 1, 0.3);
    // 左下臂
    rigRotation("LeftLowerArm", riggedPose.LeftLowerArm, 1, 0.3);

    // 左上腿
    rigRotation("LeftUpperLeg", riggedPose.LeftUpperLeg, 1, 0.3);
    // 左下腿
    rigRotation("LeftLowerLeg", riggedPose.LeftLowerLeg, 1, 0.3);
    // 右上腿
    rigRotation("RightUpperLeg", riggedPose.RightUpperLeg, 1, 0.3);
    // 右下腿
    rigRotation("RightLowerLeg", riggedPose.RightLowerLeg, 1, 0.3);
  }

  // Animate Hands
  // 手掌动画
  if (leftHandLandmarks) {
    // 根据关键点位置计算移动方式
    riggedLeftHand = Kalidokit.Hand.solve(leftHandLandmarks, "Left");
    // 左手
    rigRotation("LeftHand", {
      // Combine pose rotation Z and hand rotation X Y
      z: riggedPose.LeftHand.z,
      y: riggedLeftHand.LeftWrist.y,
      x: riggedLeftHand.LeftWrist.x,
    });
    rigRotation("LeftRingProximal", riggedLeftHand.LeftRingProximal);
    rigRotation("LeftRingIntermediate", riggedLeftHand.LeftRingIntermediate);
    rigRotation("LeftRingDistal", riggedLeftHand.LeftRingDistal);
    rigRotation("LeftIndexProximal", riggedLeftHand.LeftIndexProximal);
    rigRotation("LeftIndexIntermediate", riggedLeftHand.LeftIndexIntermediate);
    rigRotation("LeftIndexDistal", riggedLeftHand.LeftIndexDistal);
    rigRotation("LeftMiddleProximal", riggedLeftHand.LeftMiddleProximal);
    rigRotation("LeftMiddleIntermediate",
        riggedLeftHand.LeftMiddleIntermediate);
    rigRotation("LeftMiddleDistal", riggedLeftHand.LeftMiddleDistal);
    rigRotation("LeftThumbProximal", riggedLeftHand.LeftThumbProximal);
    rigRotation("LeftThumbIntermediate", riggedLeftHand.LeftThumbIntermediate);
    rigRotation("LeftThumbDistal", riggedLeftHand.LeftThumbDistal);
    rigRotation("LeftLittleProximal", riggedLeftHand.LeftLittleProximal);
    rigRotation("LeftLittleIntermediate",
        riggedLeftHand.LeftLittleIntermediate);
    rigRotation("LeftLittleDistal", riggedLeftHand.LeftLittleDistal);
  }
  if (rightHandLandmarks) {
    riggedRightHand = Kalidokit.Hand.solve(rightHandLandmarks, "Right");
    rigRotation("RightHand", {
      // Combine Z axis from pose hand and X/Y axis from hand wrist rotation
      z: riggedPose.RightHand.z,
      y: riggedRightHand.RightWrist.y,
      x: riggedRightHand.RightWrist.x,
    });
    rigRotation("RightRingProximal", riggedRightHand.RightRingProximal);
    rigRotation("RightRingIntermediate", riggedRightHand.RightRingIntermediate);
    rigRotation("RightRingDistal", riggedRightHand.RightRingDistal);
    rigRotation("RightIndexProximal", riggedRightHand.RightIndexProximal);
    rigRotation("RightIndexIntermediate",
        riggedRightHand.RightIndexIntermediate);
    rigRotation("RightIndexDistal", riggedRightHand.RightIndexDistal);
    rigRotation("RightMiddleProximal", riggedRightHand.RightMiddleProximal);
    rigRotation("RightMiddleIntermediate",
        riggedRightHand.RightMiddleIntermediate);
    rigRotation("RightMiddleDistal", riggedRightHand.RightMiddleDistal);
    rigRotation("RightThumbProximal", riggedRightHand.RightThumbProximal);
    rigRotation("RightThumbIntermediate",
        riggedRightHand.RightThumbIntermediate);
    rigRotation("RightThumbDistal", riggedRightHand.RightThumbDistal);
    rigRotation("RightLittleProximal", riggedRightHand.RightLittleProximal);
    rigRotation("RightLittleIntermediate",
        riggedRightHand.RightLittleIntermediate);
    rigRotation("RightLittleDistal", riggedRightHand.RightLittleDistal);
  }
};

/* SETUP MEDIAPIPE HOLISTIC INSTANCE */
// 设置媒体管道全体实例  输入和输出
let videoElement = document.querySelector(".input_video"),
    guideCanvas = document.querySelector("canvas.guides");

const onResults = (results) => {
  // Draw landmark guides
  // 相机显示窗口画出关键点（骨骼）
  drawResults(results);
  // Animate model
  // 动画模型驱动
  animateVRM(currentVrm, results);
};
// 整体的
const holistic = new Holistic({
  locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1635989137/${file}`;
  },
});

holistic.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7,
  refineFaceLandmarks: true,
});
// Pass holistic a callback function
holistic.onResults(onResults);

// 画骨骼信息
const drawResults = (results) => {
  guideCanvas.width = videoElement.videoWidth;
  guideCanvas.height = videoElement.videoHeight;
  let canvasCtx = guideCanvas.getContext("2d");
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
  // Use `Mediapipe` drawing functions
  drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {
    color: "#00cff7",
    lineWidth: 4,
  });
  drawLandmarks(canvasCtx, results.poseLandmarks, {
    color: "#ff0364",
    lineWidth: 2,
  });
  drawConnectors(canvasCtx, results.faceLandmarks, FACEMESH_TESSELATION, {
    color: "#C0C0C070",
    lineWidth: 1,
  });
  if (results.faceLandmarks && results.faceLandmarks.length === 478) {
    //draw pupils
    drawLandmarks(canvasCtx,
        [results.faceLandmarks[468], results.faceLandmarks[468 + 5]], {
          color: "#ffe603",
          lineWidth: 2,
        });
  }
  drawConnectors(canvasCtx, results.leftHandLandmarks, HAND_CONNECTIONS, {
    color: "#eb1064",
    lineWidth: 5,
  });
  drawLandmarks(canvasCtx, results.leftHandLandmarks, {
    color: "#00cff7",
    lineWidth: 2,
  });
  drawConnectors(canvasCtx, results.rightHandLandmarks, HAND_CONNECTIONS, {
    color: "#22c3e3",
    lineWidth: 5,
  });
  drawLandmarks(canvasCtx, results.rightHandLandmarks, {
    color: "#ff0364",
    lineWidth: 2,
  });
};

// Use `Mediapipe` utils to get camera - lower resolution = higher fps
// 使用工具类获取低分辨率图像以提升帧率
const camera = new Camera(videoElement, {
  onFrame: async () => {
    await holistic.send({image: videoElement});
  },
  width: 640,
  height: 480,
});
camera.start();
