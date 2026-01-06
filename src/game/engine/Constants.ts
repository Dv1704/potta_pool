export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

export const FPS = 60;
export const FPS_TIME = 1000 / FPS;

export const GAME_MODE_EIGHT = 0;
export const GAME_MODE_NINE = 1;
export const GAME_MODE_TIME = 2;

export const GAME_MODE_CPU = 0;
export const GAME_MODE_TWO = 1;

export const STATE_TABLE_PLACE_CUE_BALL_BREAKSHOT = 0;
export const STATE_TABLE_PLACE_CUE_BALL = 1;
export const STATE_TABLE_MOVE_STICK = 2;
export const STATE_TABLE_SHOOT = 3;
export const STATE_TABLE_SHOOTING = 4;

export const FIELD_POINTS = [
    { x: 88, y: 46 }, // 0
    { x: 130, y: 81 }, // 1
    { x: 607, y: 81 }, // 2
    { x: 620, y: 32 }, // 3
    { x: 659, y: 32 }, // 4
    { x: 673, y: 81 }, // 5
    { x: 1150, y: 81 }, // 6
    { x: 1193, y: 44 }, // 7
    { x: 1226, y: 77 }, // 8
    { x: 1189, y: 121 }, // 9
    { x: 1189, y: 591 }, // 10
    { x: 1226, y: 636 }, // 11
    { x: 1193, y: 667 }, // 12
    { x: 1150, y: 631 }, // 13
    { x: 673, y: 631 }, // 14
    { x: 658, y: 679 }, // 15
    { x: 622, y: 679 }, // 16
    { x: 607, y: 631 }, // 17
    { x: 130, y: 631 }, // 18
    { x: 86, y: 665 }, // 19
    { x: 55, y: 635 }, // 20
    { x: 91, y: 592 }, // 21
    { x: 91, y: 114 }, // 22
    { x: 53, y: 74 }, // 23
];

export const HOLE_CENTER_POS = [
    { x: 95, y: 85 },
    { x: 640, y: 72 },
    { x: 1185, y: 88 },
    { x: 1185, y: 628 },
    { x: 640, y: 639 },
    { x: 95, y: 628 },
];

export const POOL_HOLE_RADIUS = 30;
export const DIST_BALL_HOLE = 66;
export const BALL_DIAMETER = 28;
export const BALL_DIAMETER_QUADRO = Math.pow(BALL_DIAMETER, 2);
export const BALL_RADIUS = BALL_DIAMETER / 2;
export const BALL_RADIUS_QUADRO = Math.pow(BALL_RADIUS, 2);

export const CUE_BALL_POS = { x: 357, y: 356 };
export const CUE_BALL_RESPOT_1 = { x: 109, y: 102 };
export const CUE_BALL_RESPOT_3 = { x: 1168, y: 616 };

export const STARTING_RACK_POS: Record<number, { x: number; y: number }[]> = {
    [GAME_MODE_EIGHT]: [
        { x: 916, y: 356 },
        { x: 941, y: 370 },
        { x: 941, y: 342 },
        { x: 966, y: 384 },
        { x: 966, y: 356 }, // BALL 8
        { x: 966, y: 328 },
        { x: 991, y: 398 },
        { x: 991, y: 370 },
        { x: 991, y: 342 },
        { x: 991, y: 314 },
        { x: 1016, y: 412 },
        { x: 1016, y: 384 },
        { x: 1016, y: 356 },
        { x: 1016, y: 328 },
        { x: 1016, y: 300 },
    ],
    [GAME_MODE_NINE]: [
        { x: 916, y: 356 },
        { x: 949, y: 376 },
        { x: 949, y: 335 },
        { x: 982, y: 396 },
        { x: 982, y: 356 },
        { x: 982, y: 316 },
        { x: 1015, y: 376 },
        { x: 1015, y: 335 },
        { x: 1048, y: 356 },
    ],
    [GAME_MODE_TIME]: [
        { x: 916, y: 356 },
        { x: 949, y: 376 },
        { x: 949, y: 335 },
        { x: 982, y: 396 },
        { x: 982, y: 356 },
        { x: 982, y: 316 },
        { x: 1015, y: 416 },
        { x: 1015, y: 376 },
        { x: 1015, y: 335 },
        { x: 1015, y: 295 },
        { x: 1048, y: 436 },
        { x: 1048, y: 396 },
        { x: 1048, y: 356 },
        { x: 1048, y: 316 },
        { x: 1048, y: 276 },
    ],
};

export const RECT_COLLISION = {
    x: 124,
    y: 117,
    width: 1037,
    height: 483,
};

export const MAX_SPIN_VALUE = 50;
export const K_IMPACT_BALL = 0.97;
export const K_FRICTION = 0.985;
export const K_MIN_FORCE = 0.016;
export const MAX_POWER_SHOT = 200;
export const MIN_POWER_SHOT = 10;
export const MAX_POWER_FORCE_BALL = 40;

export const MAX_BACK_SPIN_CUE_FORCE = 3;

export const MAIN_TABLE_EDGE = [1, 5, 9, 13, 17, 21];

export const ON_BALL_INTO_HOLE = 4;
export const ON_BALL_WITH_BALL = 5;
export const ON_BALL_WITH_BANK = 6;

export const DOUBLE_PI = 2 * Math.PI;
export const HALF_PI = Math.PI / 2;
