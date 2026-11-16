import { lampSpots } from "../harbour.js";
import { createDolphins } from "./dolphins.js";
import { createFish } from "./fish.js";
import { createGulls } from "./gulls.js";
import { createSeaweed } from "./seaweed.js";

const BUDGET = {
  full: { schools: 10, perSchool: 12, seaweed: 3600, gulls: 2, perched: 2 },
  light: { schools: 6, perSchool: 8, seaweed: 1500, gulls: 2, perched: 2 },
};

export function createLife({ scene, patchMaterial, baseUrl, site, floaters, light, boat }) {
  const budget = light ? BUDGET.light : BUDGET.full;
  const start = { x: site.head.center.x + site.out.x * 90, z: site.head.center.z + site.out.z * 90 };
  const dolphins = createDolphins({ scene, patchMaterial, baseUrl, floaters, start });
  const fish = createFish({ scene, patchMaterial, site, schools: budget.schools, perSchool: budget.perSchool, baseUrl });
  const seaweed = createSeaweed({ scene, patchMaterial, site, count: budget.seaweed });
  const gulls = createGulls({ scene, patchMaterial, baseUrl, anchors: [boat, site.head.center], count: budget.gulls, perches: lampSpots(site).slice(-budget.perched) });
  return {
    dolphins,
    fish,
    seaweed,
    gulls,
    update(dt, time, boat, heading, speed = 0) {
      dolphins.update(dt, time, boat, heading);
      fish.update(dt, time, boat, heading, speed);
      seaweed.update(time);
      gulls.update(dt, time);
    },
  };
}
