import React, { Suspense, useCallback, useState, useEffect, useRef } from "react";
import uuid from "short-uuid";
import create from "zustand";
import { Canvas, useFrame } from "@react-three/fiber";
import { Box, Plane, Sphere, Torus, Cylinder, PerspectiveCamera, OrthographicCamera, Environment, Stats } from "@react-three/drei";
import { Physics, Debug, useBox, usePlane, useSphere, useCylinder, useCompoundBody } from "@react-three/cannon";
import { Vector3 } from "three";

const DEBUG_MODE = false;

const COLORS = {
  background: "#2c698d",
  ground: "#2c698d",
  backboard: "#272643",
  hoop: "#bae8e8",
  pole: "#272643",
  ball: "#f55951",
};

const ROUND_DURATION = 10;

const useStore = create(set => ({
  score: 0,
  addPoint: () => set(state => ({ score: state.score + 1 })),
  resetScore: () => set({ score: 0 }),
  timeLeft: ROUND_DURATION,
  setTimeLeft: seconds => set(() => ({ timeLeft: seconds })),
  gameOver: false,
  setGameOver: over => set(() => ({ gameOver: over })),
}));

const Ground = ({ ...props }) => {
  const [ref] = usePlane(() => ({ ...props }));

  return (
    <Plane receiveShadow args={[1000, 1000]} ref={ref}>
      <meshStandardMaterial color={COLORS.ground} />
    </Plane>
  );
};

const Ball = ({ position, addBall }) => {
  const size = [0.3];
  const [ref, api] = useSphere(() => ({ args: size, mass: 1, position, linearDamping: 0.01 }));
  const velocity = useRef(new Vector3());

  const shoot = () => {
    api.applyImpulse([0, 15, -10], [0, 0, 0]);
    addBall();
  };

  useEffect(() => {
    api.applyImpulse([0, 0, -2], [0, 0, 0]);
  }, []);

  useEffect(() => {
    const unsubscribe = [
      api.velocity.subscribe(v => {
        velocity.current.fromArray(v);
      }),
    ];
    return () => unsubscribe;
  }, []);

  return (
    <Sphere ref={ref} receiveShadow castShadow args={size} velocity={velocity} position={position} onPointerDown={shoot}>
      <meshStandardMaterial color={COLORS.ball} />
    </Sphere>
  );
};

const Pole = ({ color, ...props }) => {
  const size = 0.08;
  const height = 5;
  const args = [size, size, height];
  const position = [0, height / 2, -8.2];
  const [ref] = useCylinder(() => ({ args, position, ...props }));

  return (
    <Cylinder receiveShadow castShadow args={args} position={position} ref={ref}>
      <meshStandardMaterial color={COLORS.pole} />
    </Cylinder>
  );
};

const Backboard = props => {
  const position = [0, 5, -8];
  const size = [2.2, 1.8, 0.2];
  const [ref] = useBox(() => ({ args: size, type: "Static", position, ...props }));

  return (
    <Box receiveShadow castShadow args={size} ref={ref} position>
      <meshStandardMaterial color={COLORS.backboard} />
    </Box>
  );
};

const Hoop = props => {
  const addPoint = useStore(state => state.addPoint);
  const scorable = useRef(false);

  const position = [0, 4.5, -7.35];
  const size = [0.05];
  const gap = 0.5;
  const shapes = [];

  const meshSize = 0.25;
  const meshShape = {
    radius: 2 * meshSize,
    tube: 0.25 * meshSize,
    radialSegments: 10,
    tubularSegments: 30,
    arc: Math.PI * 2,
  };

  for (let i = 0; i < 50; i++) {
    shapes.push({
      args: size,
      position: [Math.cos(i) * gap + position[0], position[1], Math.sin(i) * gap + position[2]],
      type: "Sphere",
    });
  }

  const [bodyRef, bodyApi] = useCompoundBody(() => ({
    args: size,
    type: "Static",
    shapes: shapes,
  }));

  const [triggerRef, triggerApi] = useBox(() => ({
    args: [0.8, 0.2, 0.8],
    position: [0, 4.35, -7.5],
    isTrigger: true,
    onCollideBegin: collision => {
      // Make sure the ball is dropping from above
      if (collision.body.velocity.current.y < 0) {
        scorable.current = true;
      } else {
        scorable.current = false;
      }
    },
    onCollideEnd: collision => {
      // And falling down through the trigger
      if (scorable.current && collision.body.velocity.current.y < 1) {
        addPoint();
        collision.body.material.color.setHex(0xc698d);
      }
      scorable.current = false;
    },
  }));

  return (
    <>
      <Torus
        receiveShadow
        castShadow
        position={position}
        rotation={[-Math.PI / 2, 0, 0]}
        args={[meshShape.radius, meshShape.tube, meshShape.radialSegments, meshShape.tubularSegments, meshShape.arc]}
      >
        <meshStandardMaterial color={COLORS.hoop} />
      </Torus>
    </>
  );
};

const Court = () => {
  const [balls, set] = useState([]);
  const addBall = useCallback(e => set(balls => [...balls, uuid.generate()]), []);

  useEffect(() => {
    addBall();
  }, []);

  return (
    <>
      <Environment preset='park' />
      <Ground position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} />

      <Pole />
      <Backboard />
      <Hoop />

      {balls.map((key, index) => (
        <Ball key={key} position={[0, 1, 3]} addBall={addBall} />
      ))}
    </>
  );
};

const Scene = ({ ortho }) => {
  const backgroundColor = COLORS.background;
  const [setTimeLeft, setGameOver, gameOver] = useStore(state => [state.setTimeLeft, state.setGameOver, state.gameOver]);

  useFrame(({ clock }) => {
    if (!gameOver && clock.elapsedTime > ROUND_DURATION + 1) {
      setGameOver(true);
    } else if (!gameOver) {
      setTimeLeft(ROUND_DURATION - parseInt(clock.elapsedTime));
    }
  });

  return (
    <>
      {!ortho && <fog attach='fog' args={[backgroundColor, 1, 45]} />}
      <color attach='background' args={[backgroundColor]} />
      <ambientLight intensity={0.5} />
      <directionalLight
        castShadow
        position={[2, 5, 2]}
        intensity={2}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <Suspense fallback={null}>
        <Physics gravity={[0, -20, 0]} defaultContactMaterial={{ friction: 0.3, restitution: 0.6 }}>
          {DEBUG_MODE ? (
            <Debug>
              <Court />
            </Debug>
          ) : (
            <Court />
          )}
        </Physics>
      </Suspense>
    </>
  );
};

const App = () => {
  const [score, timeLeft] = useStore(state => [state.score, state.timeLeft]);
  const [ortho, setOrtho] = useState(false);
  const orthographicRef = useRef();
  const perspectiveRef = useRef();

  const perspectiveSettings = {
    fov: 45,
    position: [0.3, 1.5, 4],
    rotation: [0, 0.03, 0],
    zoom: 0.8,
  };

  const orthographicSettings = {
    zoom: 60,
    left: window.innerWidth / -2,
    right: window.innerWidth / 2,
    top: window.innerHeight / 2,
    bottom: window.innerHeight / -2,
    near: 1,
    far: 2000,
    position: [-57.2, 66, 176],
    rotation: [-0.34, -0.289, -0.1],
  };

  return (
    <>
      <Canvas shadows dpr={[1, 2]}>
        <PerspectiveCamera ref={perspectiveRef} {...perspectiveSettings} makeDefault={!ortho} />
        <OrthographicCamera ref={orthographicRef} {...orthographicSettings} makeDefault={ortho} />
        <Scene ortho={ortho} />
      </Canvas>
      <div className='score'>
        {score}
        {/* {timeLeft} */}
      </div>
      <button className='button' onClick={() => setOrtho(!ortho)}>
        Switch Cams
      </button>
      {DEBUG_MODE && <Stats className='stats' />}
    </>
  );
};

export default App;
