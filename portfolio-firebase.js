import {
  ADMIN_EMAIL,
  INSTAPAY_DETAILS,
  VODAFONE_CASH_NUMBER,
  WHATSAPP_NUMBER,
  auth,
  db
} from "./firebase-config.js";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const adminEmail = ADMIN_EMAIL.trim().toLowerCase();
const githubProfileUrl = "https://github.com/ahmedhany-ai";
const loginForm = document.getElementById("admin-login-form");
const authStatus = document.getElementById("auth-status");
const authStatusMessage = document.getElementById("auth-status-message");
const loginButton = loginForm?.querySelector('button[type="submit"]');
const projectsGrid = document.getElementById("projects-grid");
const fallbackProjectCards = Array.from(projectsGrid.children);
const checkoutModal = document.getElementById("checkout-modal");
const checkoutForm = document.getElementById("checkout-form");
const checkoutSuccess = document.getElementById("checkout-success");
const checkoutMethod = document.getElementById("checkout-payment-method");
const checkoutReference = document.getElementById("checkout-transaction-reference");
const checkoutInstructions = document.getElementById("checkout-payment-instructions");
let currentCheckoutProduct = null;
let renderedProjects = null;
let storeSettings = {
  instapayDetails: INSTAPAY_DETAILS,
  vodafoneCashNumber: VODAFONE_CASH_NUMBER,
  whatsappNumber: WHATSAPP_NUMBER
};

function showAuthMessage(message) {
  authStatusMessage.textContent = message;
  authStatus.classList.remove("hidden");
  authStatus.classList.add("flex");
}

function showAdminModal() {
  authStatus.classList.add("hidden");
  authStatus.classList.remove("flex");
  document.getElementById("admin-modal").classList.remove("opacity-0", "pointer-events-none");
  document.getElementById("admin-card").classList.remove("scale-95");
  document.getElementById("admin-card").classList.add("scale-100");
}

document.querySelectorAll('button[aria-label="Admin access"], #admin-trigger-btn').forEach(button => {
  button.addEventListener("click", showAdminModal);
});

const adminModal = document.getElementById("admin-modal");
const adminCard = document.getElementById("admin-card");
function closeAdminModal() {
  adminModal.classList.add("opacity-0", "pointer-events-none");
  adminCard.classList.add("scale-95");
  adminCard.classList.remove("scale-100");
}

document.getElementById("close-admin-modal").addEventListener("click", closeAdminModal);
adminModal.addEventListener("click", event => {
  if (event.target === adminModal) closeAdminModal();
});

loginForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const email = document.getElementById("admin-email").value.trim().toLowerCase();
  const password = document.getElementById("admin-password").value;

  if (!adminEmail || adminEmail.includes("your_admin_email")) {
    showAuthMessage("Set ADMIN_EMAIL in firebase-config.js before signing in.");
    return;
  }
  if (email !== adminEmail) {
    showAuthMessage("This email is not authorized for the admin dashboard.");
    return;
  }

  loginButton.disabled = true;
  try {
    const persistence = document.querySelector('#admin-login-form input[type="checkbox"]').checked
      ? browserLocalPersistence
      : browserSessionPersistence;
    await setPersistence(auth, persistence);
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "./admin.html";
  } catch (error) {
    showAuthMessage(error.code === "auth/invalid-credential"
      ? "The email or password is incorrect."
      : `Sign-in failed: ${error.message}`);
  } finally {
    loginButton.disabled = false;
  }
});

onAuthStateChanged(auth, user => {
  if (user && user.email?.toLowerCase() !== adminEmail) {
    signOut(auth).catch(error => console.error("Could not sign out unauthorized user:", error));
  }
});

function safeWebUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function safeImageUrl(value) {
  if (!value) return "";
  if (/^data:image\/(?:jpeg|png|webp);base64,/i.test(value)) return value;
  return safeWebUrl(value);
}

function makeTag(text) {
  const tag = document.createElement("span");
  tag.className = "px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-code-label text-[11px]";
  tag.textContent = text;
  return tag;
}

function makeProjectCard(project) {
  const categories = Array.isArray(project.category)
    ? project.category
    : String(project.category || "web").toLowerCase().split(/[ ,]+/).filter(Boolean);
  const card = document.createElement("article");
  card.className = "project-card flex flex-col rounded-2xl bg-surface-container-low/90 backdrop-blur-xl overflow-hidden hover:shadow-[0_12px_32px_-8px_rgba(6,182,212,0.25)] transition-all duration-300 group";
  card.dataset.category = categories.join(" ");

  const imageFrame = document.createElement("div");
  imageFrame.className = "relative w-full aspect-video overflow-hidden bg-surface-container-highest";
  const imageUrl = safeImageUrl(project.imageUrl);
  if (imageUrl) {
    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = project.title || "Project cover";
    image.className = "w-full h-full object-cover transition-transform duration-500 group-hover:scale-105";
    imageFrame.appendChild(image);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "w-full h-full flex items-center justify-center text-primary";
    placeholder.innerHTML = '<span class="material-symbols-outlined text-5xl">deployed_code</span>';
    imageFrame.appendChild(placeholder);
  }
  const categoryBadge = document.createElement("span");
  categoryBadge.className = "absolute top-4 left-4 px-2.5 py-1 rounded-md bg-surface-container-lowest/80 backdrop-blur-md text-primary font-code-label text-[11px] font-semibold";
  categoryBadge.textContent = categories.map(category => ({
    ai: "AI & Automation",
    desktop: "Desktop Software",
    web: "Web Apps",
    research: "Research & Prototyping"
  }[category] || category)).join(" & ");
  imageFrame.appendChild(categoryBadge);

  const content = document.createElement("div");
  content.className = "p-6 flex flex-col flex-1 justify-between gap-6";
  const details = document.createElement("div");
  details.className = "flex flex-col gap-3";
  const title = document.createElement("h3");
  title.className = "font-headline-md text-headline-sm text-on-surface font-bold group-hover:text-primary transition-colors";
  title.textContent = project.title || "Untitled project";
  const description = document.createElement("p");
  description.className = "font-body-sm text-body-sm text-on-surface-variant leading-relaxed";
  description.textContent = project.description || "";
  details.append(title, description);

  const footer = document.createElement("div");
  footer.className = "flex flex-col gap-5";
  const tags = document.createElement("div");
  tags.className = "flex flex-wrap gap-1.5";
  (Array.isArray(project.techTags) ? project.techTags : []).forEach(tag => tags.appendChild(makeTag(tag)));
  footer.appendChild(tags);

  const videoUrl = safeWebUrl(project.videoUrl);
  if (videoUrl) {
    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.className = "demo-video-trigger inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 transition-all font-headline-sm text-body-sm font-bold shadow-sm";
    previewButton.dataset.title = `${project.title || "Project"} — Demo`;
    previewButton.dataset.badge = categoryBadge.textContent;
    previewButton.dataset.video = videoUrl;
    previewButton.dataset.desc = project.description || "";
    previewButton.textContent = "Watch Demo Video";
    footer.appendChild(previewButton);
  }

  if (project.itemType === "product" && Number(project.price) > 0) {
    const purchase = document.createElement("div");
    purchase.className = "flex items-center justify-between gap-3 p-3 rounded-xl bg-secondary/10 border border-secondary/20";
    const price = document.createElement("span");
    price.className = "font-headline-sm text-body-sm font-bold text-secondary";
    price.textContent = `${Number(project.price).toLocaleString()} ${project.currency || "USD"}`;
    const buyButton = document.createElement("button");
    buyButton.type = "button";
    buyButton.className = "px-4 py-2 rounded-lg bg-secondary text-on-secondary font-headline-sm text-body-sm font-bold hover:bg-secondary-container transition-colors";
    buyButton.textContent = "Buy Now / اشتري الآن";
    buyButton.addEventListener("click", () => openCheckout(project));
    purchase.append(price, buyButton);
    footer.appendChild(purchase);
  }

  const links = document.createElement("div");
  links.className = "grid grid-cols-1 gap-2.5 pt-2";
  const configuredGithubUrl = safeWebUrl(project.githubUrl);
  const githubUrl = configuredGithubUrl && new URL(configuredGithubUrl).pathname !== "/"
    ? configuredGithubUrl
    : githubProfileUrl;
  [
    { label: "GitHub", url: githubUrl, icon: "code", style: "bg-surface-container text-on-surface hover:bg-surface-container-high" },
    { label: "Live Demo", url: project.liveDemoUrl, icon: "open_in_new", style: "bg-primary text-on-primary hover:bg-tertiary" }
  ].forEach(link => {
    const url = safeWebUrl(link.url);
    if (!url) return;
    const anchor = document.createElement("a");
    anchor.className = `inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg transition-colors font-headline-sm text-body-sm font-medium ${link.style}`;
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined text-[16px]";
    icon.textContent = link.icon;
    const label = document.createElement("span");
    label.textContent = link.label;
    anchor.append(icon, label);
    links.appendChild(anchor);
  });
  if (links.children.length > 1) links.classList.add("sm:grid-cols-2");
  footer.appendChild(links);
  content.append(details, footer);
  card.append(imageFrame, content);
  return card;
}

function updateFilterLabels(projects) {
  const fallbackCategories = renderedProjects === null
    ? Array.from(projectsGrid.querySelectorAll(".project-card"), card => card.dataset.category || "")
    : null;
  const counts = {
    all: fallbackCategories ? fallbackCategories.length : projects.length,
    ai: fallbackCategories
      ? fallbackCategories.filter(category => category.split(/\s+/).includes("ai")).length
      : projects.filter(project => String(project.category || "").toLowerCase().includes("ai")).length,
    web: fallbackCategories
      ? fallbackCategories.filter(category => category.split(/\s+/).includes("web")).length
      : projects.filter(project => String(project.category || "").toLowerCase().includes("web")).length,
    desktop: fallbackCategories
      ? fallbackCategories.filter(category => category.split(/\s+/).includes("desktop")).length
      : projects.filter(project => String(project.category || "").toLowerCase().includes("desktop")).length
  };
  const labels = document.querySelectorAll("#project-filters .filter-btn");
  const arabic = document.documentElement.lang === "ar";
  const names = arabic
    ? [`الكل (${counts.all})`, `الذكاء الاصطناعي والأتمتة (${counts.ai})`, `تطبيقات الويب (${counts.web})`, `برامج سطح المكتب (${counts.desktop})`]
    : [`All (${counts.all})`, `AI & Automation (${counts.ai})`, `Web Apps (${counts.web})`, `Desktop Software (${counts.desktop})`];
  labels.forEach((button, index) => {
    if (names[index]) button.textContent = names[index];
  });
}

window.refreshProjectFilterLabels = () => updateFilterLabels(renderedProjects || []);
window.refreshProjectFilterLabels();

function applyActiveProjectFilter() {
  const filter = document.querySelector("#project-filters .filter-btn.active")?.dataset.filter || "all";
  projectsGrid.querySelectorAll(".project-card").forEach(card => {
    const categories = card.dataset.category || "";
    card.style.display = filter === "all" || categories.includes(filter) ? "flex" : "none";
  });
}

function updatePaymentInstructions() {
  const method = checkoutMethod.value;
  const referenceLabel = document.getElementById("checkout-reference-field");
  checkoutReference.required = method !== "external";
  referenceLabel.firstChild.textContent = method === "external"
    ? "Transaction Reference ID (optional) / رقم العملية (اختياري)"
    : "Transaction Reference ID / رقم العملية";

  if (method === "external") {
    checkoutInstructions.textContent = "After placing the order, continue to the external card payment page. / بعد تأكيد الطلب، تابع إلى صفحة الدفع الخارجية.";
  } else if (method === "instapay") {
    checkoutInstructions.textContent = `InstaPay / إنستاباي: ${storeSettings.instapayDetails}. Pay first, then enter the transaction reference. / ادفع أولاً ثم أدخل رقم العملية.`;
  } else {
    checkoutInstructions.textContent = `Vodafone Cash / فودافون كاش: ${storeSettings.vodafoneCashNumber}. Pay first, then enter the transaction reference. / ادفع أولاً ثم أدخل رقم العملية.`;
  }
}

function openCheckout(product) {
  currentCheckoutProduct = product;
  checkoutForm.reset();
  checkoutForm.classList.remove("hidden");
  checkoutSuccess.classList.add("hidden");
  checkoutSuccess.classList.remove("flex");
  document.getElementById("checkout-error").classList.add("hidden");
  document.getElementById("checkout-product-title").textContent = product.title || "";
  document.getElementById("checkout-price").textContent =
    `${Number(product.price).toLocaleString()} ${product.currency || "USD"}`;

  const externalOption = checkoutMethod.querySelector('option[value="external"]');
  const paymentUrl = safeWebUrl(product.paymentUrl);
  externalOption.disabled = !paymentUrl;
  externalOption.hidden = !paymentUrl;
  checkoutMethod.value = paymentUrl ? "external" : "instapay";
  updatePaymentInstructions();

  checkoutModal.classList.remove("opacity-0", "pointer-events-none");
  document.getElementById("checkout-card").classList.remove("scale-95");
}

function closeCheckout() {
  checkoutModal.classList.add("opacity-0", "pointer-events-none");
  document.getElementById("checkout-card").classList.add("scale-95");
  currentCheckoutProduct = null;
}

checkoutMethod.addEventListener("change", updatePaymentInstructions);
document.getElementById("close-checkout").addEventListener("click", closeCheckout);
document.getElementById("checkout-done").addEventListener("click", closeCheckout);
checkoutModal.addEventListener("click", event => {
  if (event.target === checkoutModal) closeCheckout();
});

checkoutForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentCheckoutProduct) return;

  const submitButton = document.getElementById("checkout-submit");
  const errorMessage = document.getElementById("checkout-error");
  submitButton.disabled = true;
  errorMessage.classList.add("hidden");
  const method = checkoutMethod.value;
  const paymentUrl = safeWebUrl(currentCheckoutProduct.paymentUrl);
  if (method === "external" && !paymentUrl) {
    errorMessage.textContent = "This product has no external payment link. Choose a local payment method.";
    errorMessage.classList.remove("hidden");
    submitButton.disabled = false;
    return;
  }

  const orderData = {
    itemId: currentCheckoutProduct.id,
    itemTitle: currentCheckoutProduct.title,
    price: Number(currentCheckoutProduct.price),
    currency: currentCheckoutProduct.currency || "USD",
    customerName: document.getElementById("checkout-customer-name").value.trim(),
    customerEmail: document.getElementById("checkout-customer-email").value.trim().toLowerCase(),
    paymentMethod: method,
    transactionReference: checkoutReference.value.trim(),
    status: "pending",
    createdAt: serverTimestamp()
  };

  try {
    const order = await addDoc(collection(db, "orders"), orderData);
    const whatsappNumber = storeSettings.whatsappNumber.replace(/\D/g, "");
    const confirmation = [
      "Hello, I placed a product order.",
      `Order: ${order.id}`,
      `Product: ${orderData.itemTitle}`,
      `Amount: ${orderData.price} ${orderData.currency}`,
      `Customer: ${orderData.customerName} (${orderData.customerEmail})`,
      `Payment method: ${method}`,
      `Transaction reference: ${orderData.transactionReference || "Pending external payment"}`,
      "مرحباً، قمت بإرسال طلب شراء. أرجو تأكيد الطلب."
    ].join("\n");
    document.getElementById("checkout-whatsapp-link").href =
      `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(confirmation)}`;

    const externalLink = document.getElementById("checkout-external-link");
    if (method === "external") {
      externalLink.href = paymentUrl;
      externalLink.classList.remove("hidden");
    } else {
      externalLink.classList.add("hidden");
    }

    document.getElementById("checkout-success-message").textContent =
      `Order ${order.id} saved. We will confirm your payment shortly. / تم حفظ الطلب، وسنؤكد الدفع قريباً.`;
    checkoutForm.classList.add("hidden");
    checkoutSuccess.classList.remove("hidden");
    checkoutSuccess.classList.add("flex");
  } catch (error) {
    console.error("Could not save product order:", error);
    errorMessage.textContent = `Order could not be saved: ${error.message}`;
    errorMessage.classList.remove("hidden");
  } finally {
    submitButton.disabled = false;
  }
});

onSnapshot(
  query(collection(db, "projects"), orderBy("createdAt", "desc")),
  snapshot => {
    if (snapshot.empty) {
      renderedProjects = null;
      projectsGrid.replaceChildren(...fallbackProjectCards);
      updateFilterLabels([]);
      applyActiveProjectFilter();
      return;
    }
    renderedProjects = snapshot.docs.map(documentSnapshot => ({
      id: documentSnapshot.id,
      ...documentSnapshot.data()
    }));
    projectsGrid.replaceChildren(...renderedProjects.map(makeProjectCard));
    updateFilterLabels(renderedProjects);
    applyActiveProjectFilter();
  },
  error => console.error("Could not load portfolio projects from Firestore:", error)
);

onSnapshot(
  doc(db, "settings", "store"),
  snapshot => {
    const settings = snapshot.exists() ? snapshot.data() : {};
    storeSettings = {
      instapayDetails: typeof settings.instapayDetails === "string"
        ? settings.instapayDetails
        : INSTAPAY_DETAILS,
      vodafoneCashNumber: typeof settings.vodafoneCashNumber === "string"
        ? settings.vodafoneCashNumber
        : VODAFONE_CASH_NUMBER,
      whatsappNumber: typeof settings.whatsappNumber === "string"
        ? settings.whatsappNumber
        : WHATSAPP_NUMBER
    };
    if (!checkoutModal.classList.contains("pointer-events-none")) {
      updatePaymentInstructions();
    }
  },
  error => console.error("Could not load store settings:", error)
);
