import { boot } from "@/app/boot";
import "@/style.css";

const root = document.getElementById("root");
if (!root) throw new Error('Root element with id "root" not found');

const app = boot(root);
if (import.meta.hot) import.meta.hot.dispose(() => app.destroy());
