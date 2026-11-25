import {
  ADMIN_EMAIL,
  INSTAPAY_DETAILS,
  VODAFONE_CASH_NUMBER,
  WHATSAPP_NUMBER,
  auth,
  db
} from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  serverTimestamp,
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const publicPage = "./index.html";
const adminEmail = ADMIN_EMAIL.trim().toLowerCase();
const projectForm = document.getElementById("project-form");
const storeSettingsForm = document.getElementById("store-settings-form");
const projectListing = document.getElementById("projects-listing");
const tagContainer = document.getElementById("tech-pill-container");
const imageFileInput = document.getElementById("project-image-file");
const projectsById = new Map();
const deliveryUrls = new Map();
let stopProjectListener = null;
let stopOrdersListener = null;
let currentOrders = [];

projectListing.replaceChildren();
tagContainer.replaceChildren();
document.getElementById("admin-email-display").textContent = ADMIN_EMAIL;

function updateProductFields() {
  const isProduct = document.getElementById("project-item-type").value === "product";
  const fields = document.getElementById("product-pricing-fields");
  fields.classList.toggle("hidden", !isProduct);
  fields.classList.toggle("grid", isProduct);
  document.getElementById("product-price").required = isProduct;
  document.getElementById("delivery-url").required = isProduct;
}

function setFormMode(projectId = "") {
  document.getElementById("editing-project-id").value = projectId;
  document.getElementById("edit-mode-banner").classList.toggle("hidden", !projectId);
  document.getElementById("form-cancel-btn").classList.toggle("hidden", !projectId);
  document.getElementById("submit-btn-label").textContent = projectId
    ? "Update Project"
    : "Publish Project to Pipeline";
  document.getElementById("submit-btn-icon").textContent = projectId
    ? "published_with_changes"
    : "publish";
  updateProductFields();
}

function clearProjectForm() {
  projectForm.reset();
  tagContainer.replaceChildren();
  imageFileInput.value = "";
  setFormMode();
}
window.cancelEditProject = clearProjectForm;

document.getElementById("project-item-type").addEventListener("change", updateProductFields);
document.querySelectorAll("[data-admin-tab]").forEach(button => {
  button.addEventListener("click", () => {
    const activeTab = button.dataset.adminTab;
    document.getElementById("projects-panel").classList.toggle("hidden", activeTab !== "projects");
    document.getElementById("orders-panel").classList.toggle("hidden", activeTab !== "orders");
    document.getElementById("settings-panel").classList.toggle("hidden", activeTab !== "settings");
    document.querySelectorAll("[data-admin-tab]").forEach(tab => {
      const active = tab === button;
      tab.setAttribute("aria-selected", String(active));
      tab.classList.toggle("bg-primary-container", active);
      tab.classList.toggle("text-on-primary-container", active);
      tab.classList.toggle("text-on-surface-variant", !active);
    });
  });

  async function loadStoreSettings() {
    try {
      const snapshot = await getDoc(doc(db, "settings", "store"));
      const settings = snapshot.exists() ? snapshot.data() : {};
      document.getElementById("store-instapay-details").value =
        typeof settings.instapayDetails === "string" ? settings.instapayDetails : INSTAPAY_DETAILS;
      document.getElementById("store-vodafone-cash-number").value =
        typeof settings.vodafoneCashNumber === "string" ? settings.vodafoneCashNumber : VODAFONE_CASH_NUMBER;
      document.getElementById("store-whatsapp-number").value =
        typeof settings.whatsappNumber === "string" ? settings.whatsappNumber : WHATSAPP_NUMBER;
    } catch (error) {
      console.error("Could not load store settings:", error);
      showToast(`Could not load store settings: ${error.message}`);
    }
  }

  storeSettingsForm.addEventListener("submit", async event => {
    event.preventDefault();
    const submitButton = document.getElementById("store-settings-submit");
    submitButton.disabled = true;
    try {
      await setDoc(doc(db, "settings", "store"), {
        instapayDetails: document.getElementById("store-instapay-details").value.trim(),
        vodafoneCashNumber: document.getElementById("store-vodafone-cash-number").value.trim(),
        whatsappNumber: document.getElementById("store-whatsapp-number").value.trim(),
        updatedAt: serverTimestamp()
      });
      showToast("Store payment settings saved.");
    } catch (error) {
      console.error("Could not save store settings:", error);
      showToast(`Could not save store settings: ${error.message}`);
    } finally {
      submitButton.disabled = false;
    }
  });
});

function safeWebUrl(value) {
  if (!value) return "";
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Project links must use http:// or https://.");
  }
  return parsed.href;
}

function readTags() {
  return Array.from(tagContainer.children)
    .map(tag => tag.firstChild?.textContent.trim())
    .filter(Boolean);
}

function blobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not read the compressed image."));
    reader.readAsDataURL(blob);
  });
}

async function compressImage(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 15 MB before compression.");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.78, 0.65, 0.52]) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("The selected image could not be compressed.");
    if (blob.size <= 600 * 1024) return await blobAsDataUrl(blob);
  }
  throw new Error("Compressed image is still too large. Choose a smaller image.");
}

function makeTagElement(value) {
  const tag = document.createElement("span");
  tag.className = "px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-code-label text-code-label";
  tag.textContent = value;
  return tag;
}

function makeProjectRow(projectId, project) {
  const row = document.createElement("article");
  row.className = "p-3.5 rounded-xl bg-surface-container-low hover:bg-surface-container transition-all shadow-md flex flex-col gap-3 relative group";

  const header = document.createElement("div");
  header.className = "flex items-start justify-between gap-2";
  const identity = document.createElement("div");
  identity.className = "flex items-center gap-3";
  const image = document.createElement("div");
  image.className = "w-11 h-11 rounded-lg bg-surface-container-highest overflow-hidden flex-shrink-0 flex items-center justify-center";
  if (project.imageUrl) {
    const img = document.createElement("img");
    img.src = project.imageUrl;
    img.alt = "";
    img.className = "w-full h-full object-cover";
    image.appendChild(img);
  } else {
    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined text-primary text-xl";
    icon.textContent = "deployed_code";
    image.appendChild(icon);
  }
  const info = document.createElement("div");
  const title = document.createElement("h3");
  title.className = "font-headline-sm text-headline-sm text-on-surface font-bold";
  title.textContent = project.title || "Untitled project";
  const summary = document.createElement("p");
  summary.className = "font-body-sm text-body-sm text-on-surface-variant";
  const productPrice = project.itemType === "product"
    ? ` · ${Number(project.price).toLocaleString()} ${project.currency || "USD"}`
    : "";
  summary.textContent = `${project.category || "Uncategorized"}${productPrice} · ${project.description || ""}`;
  info.append(title, summary);
  identity.append(image, info);
  header.appendChild(identity);

  const actions = document.createElement("div");
  actions.className = "flex items-center justify-between pt-2 flex-wrap gap-2";
  const tags = document.createElement("div");
  tags.className = "flex items-center gap-1.5 flex-wrap";
  (Array.isArray(project.techTags) ? project.techTags : []).forEach(tag => tags.appendChild(makeTagElement(tag)));
  const buttons = document.createElement("div");
  buttons.className = "flex items-center gap-1.5";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-code-label text-code-label flex items-center gap-1 transition-all";
  editButton.textContent = "Edit";
  editButton.addEventListener("click", () => editProject(projectId, project));

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "px-2.5 py-1.5 rounded-lg bg-error-container/20 hover:bg-error-container/40 text-error font-code-label text-code-label flex items-center gap-1 transition-all";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", async () => {
    if (!window.confirm(`Delete "${project.title || "this project"}" from Firestore?`)) return;
    deleteButton.disabled = true;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "projects", projectId));
      batch.delete(doc(db, "product-deliveries", projectId));
      await batch.commit();
      showToast("Project deleted.");
    } catch (error) {
      console.error("Could not delete project:", error);
      showToast(`Delete failed: ${error.message}`);
      deleteButton.disabled = false;
    }
  });

  buttons.append(editButton, deleteButton);
  actions.append(tags, buttons);
  row.append(header, actions);
  return row;
}

async function editProject(projectId, project) {
  document.getElementById("project-title-en").value = project.title || "";
  document.getElementById("project-title-ar").value = project.titleAr || "";
  document.getElementById("project-category").value = project.category || "web";
  document.getElementById("project-item-type").value = project.itemType || "portfolio";
  document.getElementById("project-desc-en").value = project.description || "";
  document.getElementById("project-desc-ar").value = project.descriptionAr || "";
  document.getElementById("project-video-url").value = project.videoUrl || "";
  document.getElementById("repo-url").value = project.githubUrl || "";
  document.getElementById("demo-url").value = project.liveDemoUrl || "";
  document.getElementById("project-cover-url").value =
    project.imageUrl && !project.imageUrl.startsWith("data:image/") ? project.imageUrl : "";
  document.getElementById("external-payment-url").value = project.paymentUrl || "";
  document.getElementById("product-price").value = project.price ?? "";
  document.getElementById("product-currency").value = project.currency || "USD";
  try {
    const deliverySnapshot = await getDoc(doc(db, "product-deliveries", projectId));
    const deliveryUrl = deliverySnapshot.exists() ? deliverySnapshot.data().deliveryUrl : "";
    deliveryUrls.set(projectId, deliveryUrl);
    document.getElementById("delivery-url").value = deliveryUrl;
  } catch (error) {
    console.error("Could not load product delivery details:", error);
    showToast(`Could not load delivery URL: ${error.message}`);
    return;
  }
  document.getElementById("editing-banner-name").textContent = project.title || "";
  document.getElementById("status-live").checked = !project.status || project.status === "Live";
  document.getElementById("status-beta").checked = project.status === "Beta";
  document.getElementById("status-dev").checked = project.status === "Dev";
  tagContainer.replaceChildren(...(Array.isArray(project.techTags) ? project.techTags : []).map(tag => {
    const pill = document.createElement("span");
    pill.className = "inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-high text-primary font-code-label text-code-label group";
    pill.appendChild(document.createTextNode(`${tag} `));
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "hover:text-error ml-1 leading-none text-xs";
    removeButton.textContent = "✕";
    removeButton.addEventListener("click", () => pill.remove());
    pill.appendChild(removeButton);
    return pill;
  }));
  setFormMode(projectId);
  projectForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function saveProject(event) {
  event.preventDefault();
  const submitButton = document.getElementById("form-submit-btn");
  submitButton.disabled = true;
  try {
    const projectId = document.getElementById("editing-project-id").value;
    const currentProject = projectId ? projectsById.get(projectId) : null;
    const itemType = document.getElementById("project-item-type").value;
    const price = Number(document.getElementById("product-price").value);
    const currency = document.getElementById("product-currency").value;
    const paymentUrl = safeWebUrl(document.getElementById("external-payment-url").value.trim());
    const deliveryUrl = safeWebUrl(document.getElementById("delivery-url").value.trim());
    if (itemType === "product" && (!Number.isFinite(price) || price <= 0)) {
      throw new Error("Enter a product price greater than zero.");
    }
    if (itemType === "product" && !deliveryUrl) {
      throw new Error("Add a Delivery / Download URL for this digital product.");
    }
    const file = imageFileInput.files[0];
    let imageUrl = document.getElementById("project-cover-url").value.trim();
    if (file) imageUrl = await compressImage(file);
    else if (!imageUrl && currentProject?.imageUrl) imageUrl = currentProject.imageUrl;
    else if (imageUrl) imageUrl = safeWebUrl(imageUrl);

    const data = {
      title: document.getElementById("project-title-en").value.trim(),
      titleAr: document.getElementById("project-title-ar").value.trim(),
      category: document.getElementById("project-category").value,
      itemType,
      price: itemType === "product" ? price : null,
      currency: itemType === "product" ? currency : null,
      paymentUrl: itemType === "product" ? paymentUrl : "",
      description: document.getElementById("project-desc-en").value.trim(),
      descriptionAr: document.getElementById("project-desc-ar").value.trim(),
      techTags: readTags(),
      imageUrl,
      githubUrl: safeWebUrl(document.getElementById("repo-url").value.trim()),
      liveDemoUrl: safeWebUrl(document.getElementById("demo-url").value.trim()),
      videoUrl: safeWebUrl(document.getElementById("project-video-url").value.trim()),
      status: document.querySelector('input[name="project-status"]:checked').value,
      updatedAt: serverTimestamp()
    };

    const projectRef = projectId ? doc(db, "projects", projectId) : doc(collection(db, "projects"));
    const batch = writeBatch(db);
    if (projectId) {
      batch.update(projectRef, data);
    } else {
      batch.set(projectRef, { ...data, createdAt: serverTimestamp() });
    }
    const deliveryRef = doc(db, "product-deliveries", projectRef.id);
    if (itemType === "product") {
      batch.set(deliveryRef, { deliveryUrl, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      batch.delete(deliveryRef);
    }
    await batch.commit();
    if (itemType === "product") deliveryUrls.set(projectRef.id, deliveryUrl);
    else deliveryUrls.delete(projectRef.id);

    if (projectId) {
      showToast(`Updated "${data.title}".`);
    } else {
      showToast(`Added "${data.title}" to the portfolio.`);
    }
    clearProjectForm();
  } catch (error) {
    console.error("Could not save project:", error);
    showToast(`Save failed: ${error.message}`);
  } finally {
    submitButton.disabled = false;
  }
}

function makeOrderRow(orderId, order) {
  const row = document.createElement("article");
  row.className = "p-4 rounded-xl bg-surface-container-low shadow-md flex flex-col gap-3";
  const heading = document.createElement("div");
  heading.className = "flex flex-wrap items-start justify-between gap-2";
  const identity = document.createElement("div");
  const title = document.createElement("h3");
  title.className = "font-headline-sm text-on-surface font-bold";
  title.textContent = order.itemTitle || "Digital product";
  const buyer = document.createElement("p");
  buyer.className = "font-body-sm text-on-surface-variant";
  buyer.textContent = `${order.customerName || "Customer"} · ${order.customerEmail || ""}`;
  identity.append(title, buyer);
  const status = document.createElement("span");
  status.className = order.status === "completed"
    ? "px-2 py-1 rounded-full bg-secondary/15 text-secondary font-code-label text-code-label"
    : "px-2 py-1 rounded-full bg-primary/15 text-primary font-code-label text-code-label";
  status.textContent = order.status || "pending";
  heading.append(identity, status);

  const details = document.createElement("p");
  details.className = "font-body-sm text-on-surface-variant";
  const method = {
    external: "External card",
    instapay: "InstaPay",
    vodafone_cash: "Vodafone Cash"
  }[order.paymentMethod] || order.paymentMethod || "Unknown";
  const created = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString() : "";
  details.textContent = `${Number(order.price || 0).toLocaleString()} ${order.currency || ""} · ${method} · Ref: ${order.transactionReference || "—"}${created ? ` · ${created}` : ""}`;
  row.append(heading, details);

  const deliveryUrl = deliveryUrls.get(order.itemId);
  if (order.status === "completed" && deliveryUrl) {
    const delivery = document.createElement("a");
    delivery.href = deliveryUrl;
    delivery.target = "_blank";
    delivery.rel = "noopener noreferrer";
    delivery.className = "text-primary font-code-label underline";
    delivery.textContent = "Open delivery / download";
    row.appendChild(delivery);
  }

  const actions = document.createElement("div");
  actions.className = "flex gap-2";
  if (order.status !== "completed") {
    const complete = document.createElement("button");
    complete.type = "button";
    complete.className = "px-3 py-1.5 rounded-lg bg-secondary/15 text-secondary hover:bg-secondary/25 font-code-label text-code-label";
    complete.textContent = "Mark completed";
    complete.addEventListener("click", async () => {
      complete.disabled = true;
      try {
        await updateDoc(doc(db, "orders", orderId), {
          status: "completed",
          completedAt: serverTimestamp()
        });
        showToast("Order marked completed.");
      } catch (error) {
        console.error("Could not complete order:", error);
        showToast(`Could not complete order: ${error.message}`);
        complete.disabled = false;
      }
    });
    actions.appendChild(complete);
  }

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "px-3 py-1.5 rounded-lg bg-error-container/20 text-error hover:bg-error-container/40 font-code-label text-code-label";
  remove.textContent = "Delete";
  remove.addEventListener("click", async () => {
    if (!window.confirm(`Delete order ${orderId}?`)) return;
    remove.disabled = true;
    try {
      await deleteDoc(doc(db, "orders", orderId));
      showToast("Order deleted.");
    } catch (error) {
      console.error("Could not delete order:", error);
      showToast(`Could not delete order: ${error.message}`);
      remove.disabled = false;
    }
  });
  actions.appendChild(remove);
  row.appendChild(actions);
  return row;
}

function renderOrders() {
  const pendingCount = currentOrders.filter(order => order.status !== "completed").length;
  document.getElementById("orders-count").textContent = String(currentOrders.length);
  document.getElementById("orders-pending-count").textContent = `${pendingCount} pending`;
  if (!currentOrders.length) {
    const empty = document.createElement("p");
    empty.className = "p-4 rounded-lg bg-surface-container-low text-on-surface-variant font-body-sm";
    empty.textContent = "No customer orders yet.";
    document.getElementById("orders-listing").replaceChildren(empty);
    return;
  }
  document.getElementById("orders-listing").replaceChildren(
    ...currentOrders.map(order => makeOrderRow(order.id, order))
  );
}

async function renderProjects(projects) {
  deliveryUrls.clear();
  await Promise.all(projects
    .filter(project => project.itemType === "product")
    .map(async project => {
      const delivery = await getDoc(doc(db, "product-deliveries", project.id));
      if (delivery.exists()) deliveryUrls.set(project.id, delivery.data().deliveryUrl);
    }));

  if (projects.length) {
    projectListing.replaceChildren(...projects.map(project => makeProjectRow(project.id, project)));
  } else {
    const empty = document.createElement("p");
    empty.className = "p-4 rounded-lg bg-surface-container-low text-on-surface-variant font-body-sm";
    empty.textContent = "No projects are in Firestore yet. Use the form above to add one.";
    projectListing.replaceChildren(empty);
  }
  renderOrders();
}

projectForm.addEventListener("submit", saveProject);
document.getElementById("form-cancel-btn").addEventListener("click", clearProjectForm);
document.getElementById("admin-sign-out").addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.replace(publicPage);
  } catch (error) {
    console.error("Could not sign out:", error);
    showToast(`Sign-out failed: ${error.message}`);
  }
});

updateProductFields();

onAuthStateChanged(auth, user => {
  if (!user || user.email?.toLowerCase() !== adminEmail) {
    if (user) {
      signOut(auth).catch(error => console.error("Could not sign out unauthorized user:", error));
    }
    window.location.replace(publicPage);
    return;
  }

  document.documentElement.style.visibility = "visible";
  loadStoreSettings();
  if (stopProjectListener) stopProjectListener();
  if (stopOrdersListener) stopOrdersListener();
  stopProjectListener = onSnapshot(
    query(collection(db, "projects"), orderBy("createdAt", "desc")),
    snapshot => {
      projectsById.clear();
      const projects = snapshot.docs.map(projectSnapshot => {
        const project = projectSnapshot.data();
        projectsById.set(projectSnapshot.id, project);
        return { id: projectSnapshot.id, ...project };
      });

      document.getElementById("catalog-count").textContent = String(projects.length).padStart(2, "0");
      document.getElementById("live-count").textContent =
        String(projects.filter(project => project.status === "Live").length).padStart(2, "0");
      document.getElementById("deployment-count").textContent = `${projects.length} DEPLOYMENTS`;
      renderProjects(projects).catch(error => {
        console.error("Could not load product delivery URLs:", error);
        showToast(`Could not load product delivery URLs: ${error.message}`);
      });
    },
    error => {
      console.error("Could not load projects from Firestore:", error);
      showToast(`Could not load projects: ${error.message}`);
    }
  );
  stopOrdersListener = onSnapshot(
    query(collection(db, "orders"), orderBy("createdAt", "desc")),
    snapshot => {
      currentOrders = snapshot.docs.map(orderSnapshot => ({
        id: orderSnapshot.id,
        ...orderSnapshot.data()
      }));
      renderOrders();
    },
    error => {
      console.error("Could not load customer orders:", error);
      showToast(`Could not load orders: ${error.message}`);
    }
  );
});
