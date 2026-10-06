/** The owner's ratios as concrete CSS viewports. Phone ratios are portrait
 *  (that is how they are held); screen ratios are landscape. 22:9 is both: a
 *  tall phone and an ultrawide monitor. */
export const LAYOUT_VIEWPORTS: { name: string; width: number; height: number }[] = [
  { name: "20:9 phone 360x800", width: 360, height: 800 },
  { name: "20:9 phone 412x915", width: 412, height: 915 },
  { name: "19.5:9 phone 390x844", width: 390, height: 844 },
  { name: "19.5:9 phone 430x932", width: 430, height: 932 },
  { name: "22:9 phone 393x960", width: 393, height: 960 },
  { name: "22:9 ultrawide 2200x900", width: 2200, height: 900 },
  { name: "16:9 1280x720", width: 1280, height: 720 },
  { name: "16:9 1366x768", width: 1366, height: 768 },
  { name: "16:9 1920x1080", width: 1920, height: 1080 },
  { name: "16:10 1280x800", width: 1280, height: 800 },
  { name: "16:10 1440x900", width: 1440, height: 900 },
  { name: "16:10 1920x1200", width: 1920, height: 1200 },
  { name: "5:3 800x480", width: 800, height: 480 },
  { name: "5:3 1280x768", width: 1280, height: 768 },
  { name: "7:5 1120x800", width: 1120, height: 800 },
  { name: "22.5:18 (5:4) 1280x1024", width: 1280, height: 1024 },
  { name: "iPad Pro 2048x2732 (1024x1366)", width: 1024, height: 1366 },
];

