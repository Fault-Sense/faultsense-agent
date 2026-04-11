import { mount } from "svelte";
import App from "./App.svelte";

// Svelte 5 uses `mount` instead of `new App({ target })`. The root element
// is guaranteed to exist because index.html declares <div id="app"> before
// this module loads.
mount(App, { target: document.getElementById("app")! });
