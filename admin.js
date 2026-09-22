const CONFIG = {
  SUPABASE_URL: "https://epceiyujnkqfqcepiyhi.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_l55MEex8L_TKB6ZiHvUqpA_evd3LBej"
};

const sb = window.supabase.createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY
);

let products = [];
let editingId = null;
let existingImages = [];
let newFiles = [];
let variants = [];

// --------------------------------------------------
// BASIC HELPERS
// --------------------------------------------------

const $ = id => document.getElementById(id);

const esc = s =>
  String(s ?? "").replace(
    /[&<>"']/g,
    m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m])
  );

const toast = text => {
  $("toast").textContent = text;
  $("toast").classList.remove("hidden");

  setTimeout(() => {
    $("toast").classList.add("hidden");
  }, 2200);
};

// --------------------------------------------------
// ADMIN CHECK
// --------------------------------------------------

async function isAdmin() {
  const {
    data: { user }
  } = await sb.auth.getUser();

  if (!user) return false;

  const { data, error } = await sb
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return !error && !!data;
}

// --------------------------------------------------
// BOOT
// --------------------------------------------------

async function boot() {
  const {
    data: { session }
  } = await sb.auth.getSession();

  if (!session) {
    showLogin();
    return;
  }

  if (!(await isAdmin())) {
    await sb.auth.signOut();
    showLogin("This account is not an admin.");
    return;
  }

  showApp();

  await Promise.all([
    loadSettings(),
    loadProducts(),
    loadOrders()
  ]);
}

// --------------------------------------------------
// LOGIN
// --------------------------------------------------

function showLogin(message = "") {
  $("loginView").classList.remove("hidden");
  $("appView").classList.add("hidden");

  if (message) {
    $("loginMsg").textContent = message;
  }
}

function showApp() {
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
}

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();

  $("loginMsg").textContent = "Signing in…";

  const { error } = await sb.auth.signInWithPassword({
    email: $("email").value.trim(),
    password: $("password").value
  });

  if (error) {
    $("loginMsg").textContent = error.message;
    return;
  }

  if (!(await isAdmin())) {
    await sb.auth.signOut();

    $("loginMsg").textContent =
      "This account is not registered as an admin.";

    return;
  }

  showApp();

  await Promise.all([
    loadSettings(),
    loadProducts(),
    loadOrders()
  ]);
});

$("logoutBtn").onclick = async () => {
  await sb.auth.signOut();
  location.reload();
};

// --------------------------------------------------
// WHATSAPP SETTINGS
// --------------------------------------------------

async function loadSettings() {
  const {
    data,
    error
  } = await sb
    .from("site_settings")
    .select("whatsapp_number")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    $("waMsg").textContent = error.message;
    return;
  }

  $("waNumber").value = data?.whatsapp_number || "";
}

$("saveWaBtn").onclick = async () => {
  const v = $("waNumber").value.replace(/\D/g, "");

  if (v.length < 10) {
    $("waMsg").textContent =
      "Enter a valid WhatsApp number with country code.";

    return;
  }

  $("saveWaBtn").disabled = true;
  $("waMsg").textContent = "Saving…";

  const { error } = await sb
    .from("site_settings")
    .update({
      whatsapp_number: v
    })
    .eq("id", 1);

  $("saveWaBtn").disabled = false;

  if (error) {
    $("waMsg").textContent = error.message;
    return;
  }

  $("waMsg").textContent =
    "WhatsApp number saved successfully.";

  toast("WhatsApp number updated");
};

// --------------------------------------------------
// PRODUCTS
// --------------------------------------------------

async function loadProducts() {
  const {
    data,
    error
  } = await sb
    .from("products")
    .select("*")
    .order("created_at", {
      ascending: false
    });

  if (error) {
    toast(error.message);
    return;
  }

  products = data || [];

  renderProducts();

  $("totalCount").textContent = products.length;

  $("publishedCount").textContent =
    products.filter(p => p.is_published).length;

  $("hiddenCount").textContent =
    products.filter(p => !p.is_published).length;

  $("productCountLabel").textContent =
    `${products.length} product${
      products.length === 1 ? "" : "s"
    }`;

  $("pendingCount").textContent = "0";
}

// --------------------------------------------------
// RENDER PRODUCT LIST
// --------------------------------------------------

function renderProducts() {
  const list = $("productList");
  const empty = $("emptyProducts");

  if (!products.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");

  list.innerHTML = products
    .map(p => {
      const img = p.images?.[0] || "";

      const colourNames =
        Array.isArray(p.variants)
          ? p.variants
              .map(v => v.color)
              .filter(Boolean)
              .join(", ")
          : "Default";

      return `
        <article class="product-row">

          ${
            img
              ? `
                <img
                  class="product-cover"
                  src="${esc(img)}"
                  alt="${esc(p.name)}"
                >
              `
              : `
                <div class="product-cover"></div>
              `
          }

          <div class="product-info">

            <h3>${esc(p.name)}</h3>

            <div class="product-meta">
              ${esc(p.category || "Collection")}
              · ${(p.images || []).length}
              photo${(p.images || []).length === 1 ? "" : "s"}
              · Colours: ${esc(colourNames)}
            </div>

            <div class="badges">

              <span class="badge ${p.is_published ? "live" : ""}">
                ${p.is_published ? "● Published" : "● Hidden"}
              </span>

              <span class="badge">
                Sizes:
                ${esc(
                  (p.sizes || []).join(", ") || "Contact"
                )}
              </span>

              <span class="badge">
                Stock:
                ${p.stock == null ? "—" : esc(p.stock)}
              </span>

            </div>

          </div>

          <div class="row-actions">

            <button
              class="mini-btn"
              onclick="editProduct('${p.id}')"
            >
              Edit
            </button>

            <button
              class="mini-btn"
              onclick="toggleProduct(
                '${p.id}',
                ${!p.is_published}
              )"
            >
              ${p.is_published ? "Hide" : "Publish"}
            </button>

            <button
              class="mini-btn danger"
              onclick="deleteProduct('${p.id}')"
            >
              Delete
            </button>

          </div>

        </article>
      `;
    })
    .join("");
}

// --------------------------------------------------
// NORMALIZE OLD / NEW VARIANTS
// --------------------------------------------------

function normalizeVariants(p) {

  if (
    Array.isArray(p?.variants) &&
    p.variants.length
  ) {

    return p.variants
      .map(v => ({
        color: String(v.color || "").trim(),

        images: Array.isArray(v.images)
          ? [...v.images]
          : [],

        newFiles: []
      }))
      .filter(v => v.color);
  }

  const oldImages =
    Array.isArray(p?.images)
      ? [...p.images]
      : [];

  if (oldImages.length) {

    return [
      {
        color: "Default",
        images: oldImages,
        newFiles: []
      }
    ];
  }

  return [];
}

// --------------------------------------------------
// OPEN PRODUCT EDITOR
// --------------------------------------------------

function openEditor(p = null) {

  editingId = p?.id || null;

  existingImages = [];
  newFiles = [];

  variants = normalizeVariants(p);

  $("editorTitle").textContent =
    editingId
      ? "Edit dress"
      : "Add new dress";

  $("pName").value =
    p?.name || "";

  $("pCategory").value =
    p?.category || "Dress";

  $("pDescription").value =
    p?.description || "";

  $("pSizes").value =
    (p?.sizes || []).join(", ");

  $("pPrice").value =
    p?.price || "";

  $("pOldPrice").value =
    p?.old_price || "";

  $("pStock").value =
    p?.stock ?? "";

  $("pAvailable").value =
    p?.available === false
      ? "false"
      : "true";

  $("pPublished").checked =
    p?.is_published !== false;

  $("saveMsg").textContent = "";

  renderVariants();

  $("editorModal").classList.remove("hidden");

  $("editorModal").setAttribute(
    "aria-hidden",
    "false"
  );
}

// --------------------------------------------------
// CLOSE EDITOR
// --------------------------------------------------

function closeEditor() {

  $("editorModal").classList.add("hidden");

  $("editorModal").setAttribute(
    "aria-hidden",
    "true"
  );
}

$("addProductBtn").onclick =
  () => openEditor();

$("emptyAddBtn").onclick =
  () => openEditor();

$("closeEditorBtn").onclick =
  closeEditor;

$("cancelEditorBtn").onclick =
  closeEditor;

$("editorModal").addEventListener(
  "click",
  e => {

    if (
      e.target === $("editorModal")
    ) {
      closeEditor();
    }

  }
);

// --------------------------------------------------
// ADD COLOUR
// --------------------------------------------------

$("addVariantBtn").onclick = () => {

  variants.push({
    color: "",
    images: [],
    newFiles: []
  });

  renderVariants();
};

// --------------------------------------------------
// RENDER COLOUR VARIANTS
// --------------------------------------------------

function renderVariants() {

  const box = $("variantList");

  if (!variants.length) {

    box.innerHTML = `
      <div
        class="empty"
        style="margin:12px 0;"
      >

        <h3>No colours added</h3>

        <p>
          Click “Add colour” to add
          Red, White, Black, etc.
        </p>

      </div>
    `;

    return;
  }

  box.innerHTML = variants
    .map((v, vi) => {

      const total =
        v.images.length +
        v.newFiles.length;

      // Existing uploaded photos
      const photos =
        v.images
          .map((url, i) => {

            return `
              <div class="photo-item">

                <img
                  src="${esc(url)}"
                  alt="${esc(
                    v.color || "Colour"
                  )} photo ${i + 1}"
                >

                <button
                  type="button"
                  class="remove-photo"
                  onclick="
                    removeVariantExisting(
                      ${vi},
                      ${i}
                    )
                  "
                >
                  ×
                </button>

                ${
                  i === 0
                    ? `
                      <span class="main-tag">
                        MAIN
                      </span>
                    `
                    : ""
                }

              </div>
            `;
          })
          .join("");

      // Newly selected photos
      const fresh =
        v.newFiles
          .map((file, fi) => {

            const url =
              URL.createObjectURL(file);

            return `
              <div class="photo-item">

                <img
                  src="${url}"
                  alt="New ${
                    esc(v.color || "Colour")
                  } photo ${fi + 1}"
                >

                <button
                  type="button"
                  class="remove-photo"
                  onclick="
                    removeVariantNew(
                      ${vi},
                      ${fi}
                    )
                  "
                >
                  ×
                </button>

                ${
                  v.images.length === 0 &&
                  fi === 0
                    ? `
                      <span class="main-tag">
                        MAIN
                      </span>
                    `
                    : ""
                }

              </div>
            `;
          })
          .join("");

      return `
        <div
          class="variant-card"
          style="
            border:1px solid #ddd;
            border-radius:12px;
            padding:14px;
            margin:12px 0;
          "
        >

          <div
            class="two-col"
            style="align-items:end;"
          >

            <label>
              Colour name

              <input
                id="variantColor_${vi}"
                value="${esc(v.color)}"
                maxlength="40"
                placeholder="e.g. Red"
                oninput="
                  updateVariantColor(
                    ${vi},
                    this.value
                  )
                "
              >

            </label>

            <button
              type="button"
              class="btn outline"
              onclick="
                removeVariant(${vi})
              "
            >
              Remove colour
            </button>

          </div>

          <div
            class="upload-head"
            style="margin-top:10px;"
          >

            <div>

              <strong>
                ${esc(v.color || "Colour")}
                photos
              </strong>

              <span>
                ${total}
                photo${total === 1 ? "" : "s"}
              </span>

            </div>

            <label
              class="btn outline upload-btn"
            >
              ＋ Choose photos

              <input
                type="file"
                accept="
                  image/jpeg,
                  image/png,
                  image/webp,
                  image/avif
                "
                multiple
                onchange="
                  handleVariantFiles(
                    ${vi},
                    this.files
                  )
                "
                hidden
              >

            </label>

          </div>

          <div class="photo-grid">

            ${photos}
            ${fresh}

          </div>

        </div>
      `;
    })
    .join("");
}

// --------------------------------------------------
// UPDATE COLOUR NAME
// --------------------------------------------------

function updateVariantColor(i, value) {

  if (variants[i]) {
    variants[i].color = value;
  }
}

// --------------------------------------------------
// REMOVE COLOUR
// --------------------------------------------------

function removeVariant(i) {

  variants.splice(i, 1);

  renderVariants();
}

// --------------------------------------------------
// SELECT PHOTOS
// --------------------------------------------------
// IMPORTANT:
// THERE IS NO 10-PHOTO LIMIT HERE.
// USER CAN SELECT AS MANY PHOTOS AS NEEDED.
// --------------------------------------------------

function handleVariantFiles(i, fileList) {

  const v = variants[i];

  if (!v) return;

  const picked = [...fileList];

  if (!picked.length) return;

  // No artificial photo-count limit.
  v.newFiles.push(...picked);

  $("saveMsg").textContent = "";

  renderVariants();
}

// --------------------------------------------------
// REMOVE EXISTING PHOTO
// --------------------------------------------------

function removeVariantExisting(vi, i) {

  if (!variants[vi]) return;

  variants[vi].images.splice(i, 1);

  renderVariants();
}

// --------------------------------------------------
// REMOVE NEW PHOTO
// --------------------------------------------------

function removeVariantNew(vi, i) {

  if (!variants[vi]) return;

  variants[vi].newFiles.splice(i, 1);

  renderVariants();
}

// --------------------------------------------------
// UPLOAD FILE TO SUPABASE
// --------------------------------------------------

async function uploadFile(file) {

  const safe =
    file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

  const path =
    `${crypto.randomUUID()}-${safe}`;

  const {
    error
  } = await sb.storage
    .from("product-images")
    .upload(
      path,
      file,
      {
        upsert: false,
        contentType: file.type
      }
    );

  if (error) {
    throw error;
  }

  const {
    data
  } = sb.storage
    .from("product-images")
    .getPublicUrl(path);

  return data.publicUrl;
}

// --------------------------------------------------
// SAVE PRODUCT
// --------------------------------------------------

$("productForm").addEventListener(
  "submit",
  async e => {

    e.preventDefault();

    const name =
      $("pName").value.trim();

    if (!name) {

      $("saveMsg").textContent =
        "Dress name is required.";

      return;
    }

    // At least one colour
    if (!variants.length) {

      $("saveMsg").textContent =
        "Add at least 1 colour.";

      return;
    }

    // Validate every colour
    for (const v of variants) {

      v.color =
        v.color.trim();

      if (!v.color) {

        $("saveMsg").textContent =
          "Every variant needs a colour name.";

        return;
      }

      const photoCount =
        v.images.length +
        v.newFiles.length;

      if (photoCount < 1) {

        $("saveMsg").textContent =
          `Add at least 1 photo for ${v.color}.`;

        return;
      }

      // NO MAXIMUM PHOTO CHECK HERE
    }

    $("saveProductBtn").disabled = true;

    $("saveProductBtn").textContent =
      "Saving…";

    $("saveMsg").textContent =
      "Uploading photos…";

    try {

      const finalVariants = [];

      // Upload every new photo
      for (const v of variants) {

        const uploaded =
          [...v.images];

        for (const file of v.newFiles) {

          const url =
            await uploadFile(file);

          uploaded.push(url);
        }

        finalVariants.push({
          color: v.color,
          images: uploaded
        });
      }

      // All photos together
      const allImages =
        finalVariants.flatMap(
          v => v.images
        );

      const payload = {

        price:
          Number($("pPrice").value) ||
          null,

        old_price:
          Number($("pOldPrice").value) ||
          null,

        name,

        category:
          $("pCategory").value.trim(),

        description:
          $("pDescription").value.trim(),

        sizes:
          $("pSizes")
            .value
            .split(",")
            .map(x => x.trim())
            .filter(Boolean),

        images:
          allImages,

        variants:
          finalVariants,

        is_published:
          $("pPublished").checked
      };

      let result;

      if (editingId) {

        result =
          await sb
            .from("products")
            .update(payload)
            .eq("id", editingId);

      } else {

        result =
          await sb
            .from("products")
            .insert(payload);
      }

      if (result.error) {
        throw result.error;
      }

      $("saveMsg").textContent =
        "Saved successfully.";

      toast(
        editingId
          ? "Dress updated"
          : "Dress added"
      );

      closeEditor();

      await loadProducts();

    } catch (err) {

      console.error(err);

      $("saveMsg").textContent =
        err.message ||
        "Could not save product.";

    } finally {

      $("saveProductBtn").disabled =
        false;

      $("saveProductBtn").textContent =
        "Save dress";
    }
  }
);

// --------------------------------------------------
// EDIT PRODUCT
// --------------------------------------------------

function editProduct(id) {

  const p =
    products.find(
      x => x.id === id
    );

  if (p) {
    openEditor(p);
  }
}

// --------------------------------------------------
// PUBLISH / HIDE PRODUCT
// --------------------------------------------------

async function toggleProduct(
  id,
  value
) {

  const {
    error
  } = await sb
    .from("products")
    .update({
      is_published: value
    })
    .eq("id", id);

  if (error) {

    toast(error.message);

    return;
  }

  toast(
    value
      ? "Dress published"
      : "Dress hidden"
  );

  await loadProducts();
}

// --------------------------------------------------
// DELETE PRODUCT
// --------------------------------------------------

async function deleteProduct(id) {

  const p =
    products.find(
      x => x.id === id
    );

  if (
    !p ||
    !confirm(
      `Delete "${p.name}"?`
    )
  ) {
    return;
  }

  const {
    error
  } = await sb
    .from("products")
    .delete()
    .eq("id", id);

  if (error) {

    toast(error.message);

    return;
  }

  toast("Dress deleted");

  await loadProducts();
}

// --------------------------------------------------
// ORDERS
// --------------------------------------------------

let allOrders = [];

const ORDER_STATUSES = [
  "Pending",
  "Confirmed",
  "Shipped",
  "Out for Delivery",
  "Delivered",
  "Cancelled"
];

// --------------------------------------------------
// LOAD ORDERS
// --------------------------------------------------

async function loadOrders() {

  const {
    data,
    error
  } = await sb
    .from("Order")
    .select("*")
    .order("created_at", {
      ascending: false
    });

  if (error) {

    console.error(
      "Order load error:",
      error
    );

    toast(
      "Could not load orders"
    );

    return;
  }

  allOrders =
    data || [];

  $("pendingCount").textContent =
    allOrders.filter(
      o =>
        (o.status || "Pending") ===
        "Pending"
    ).length;

  renderOrders();
}

// --------------------------------------------------
// RENDER ORDERS
// --------------------------------------------------

function renderOrders() {

  const list =
    $("orderList");

  const empty =
    $("emptyOrders");

  const label =
    $("orderCountLabel");

  const q =
    (
      $("orderSearch")?.value ||
      ""
    )
      .trim()
      .toLowerCase();

  const f =
    $("orderFilter")?.value ||
    "All";

  const rows =
    allOrders.filter(o => {

      const text =
        `${o.Customer_Name || ""}
         ${o.User_Mobile || ""}
         ${o.order_code || ""}
         ${o.id || ""}
         ${o.product_name || ""}
         ${o.color || ""}`
          .toLowerCase();

      return (
        (!q ||
          text.includes(q)) &&
        (
          f === "All" ||
          String(
            o.status ||
            "Pending"
          ) === f
        )
      );
    });

  label.textContent =
    `${rows.length} of ${
      allOrders.length
    } order${
      allOrders.length === 1
        ? ""
        : "s"
    }`;

  if (!rows.length) {

    list.innerHTML = "";

    empty.classList.remove(
      "hidden"
    );

    return;
  }

  empty.classList.add(
    "hidden"
  );

  list.innerHTML =
    rows
      .map(o => {

        const image =
          o.product_image ||
          "";

        const oid =
          o.order_code ||
          `LC${o.id}`;

        const created =
          o.created_at
            ? new Date(
                o.created_at
              ).toLocaleString(
                "en-IN"
              )
            : "";

        const delivery =
          o.expected_delivery
            ? new Date(
                o.expected_delivery
              ).toLocaleDateString(
                "en-IN"
              )
            : "Not set";

        return `
          <article
            class="order-card product-row"
            onclick="
              openOrderDetail(
                ${Number(o.id)}
              )
            "
          >

            ${
              image
                ? `
                  <img
                    class="
                      product-cover
                      order-cover
                    "
                    src="${esc(image)}"
                    alt="${esc(
                      o.product_name ||
                      "Product"
                    )}"
                  >
                `
                : `
                  <div
                    class="
                      product-cover
                      order-cover
                    "
                  ></div>
                `
            }

            <div class="product-info">

              <h3>
                ${esc(
                  o.product_name ||
                  "Product"
                )}
              </h3>

              <div class="product-meta">
                <b>Order:</b>
                ${esc(oid)}
              </div>

              <div class="product-meta">
                <b>Customer:</b>
                ${esc(
                  o.Customer_Name ||
                  ""
                )}
              </div>

              <div class="product-meta">
                <b>Mobile:</b>
                ${esc(
                  o.User_Mobile ||
                  ""
                )}
              </div>

              <div class="product-meta">
                <b>Date:</b>
                ${esc(created)}
              </div>

              ${
                o.color
                  ? `
                    <div class="product-meta">
                      <b>Colour:</b>
                      ${esc(o.color)}
                    </div>
                  `
                  : ""
              }

              <div class="badges">

                <span class="badge">
                  Size:
                  ${esc(
                    o.size ||
                    "Free Size"
                  )}
                </span>

                <span class="badge">
                  Qty:
                  ${esc(
                    o.quantity ||
                    0
                  )}
                </span>

                <span class="badge live">
                  ₹${Number(
                    o.total_amount ||
                    0
                  ).toLocaleString(
                    "en-IN"
                  )}
                </span>

                <span class="badge">
                  Delivery:
                  ${esc(delivery)}
                </span>

              </div>

            </div>

            <div
              class="
                row-actions
                order-actions
              "
              onclick="
                event.stopPropagation()
              "
            >

              <label
                class="
                  order-status-label
                "
              >

                Status

                <select
                  class="order-status"
                  onchange="
                    updateOrderStatus(
                      ${Number(o.id)},
                      this.value
                    )
                  "
                >

                  ${ORDER_STATUSES
                    .map(
                      s => `
                        <option
                          value="${esc(s)}"
                          ${
                            String(
                              o.status ||
                              "Pending"
                            ) === s
                              ? "selected"
                              : ""
                          }
                        >
                          ${esc(s)}
                        </option>
                      `
                    )
                    .join("")}

                </select>

              </label>

            </div>

          </article>
        `;
      })
      .join("");
}

// --------------------------------------------------
// ORDER DETAIL
// --------------------------------------------------

function openOrderDetail(id) {

  const o =
    allOrders.find(
      x =>
        Number(x.id) ===
        Number(id)
    );

  if (!o) return;

  const image =
    o.product_image ||
    "";

  const oid =
    o.order_code ||
    `LC${o.id}`;

  const delivery =
    o.expected_delivery
      ? new Date(
          o.expected_delivery
        ).toLocaleDateString(
          "en-IN"
        )
      : "Not set";

  $("orderDetailBody").innerHTML = `

    <h2>
      Order #${esc(oid)}
    </h2>

    <div class="detail-layout">

      ${
        image
          ? `
            <img
              class="detail-image"
              src="${esc(image)}"
              alt="${esc(
                o.product_name ||
                "Product"
              )}"
            >
          `
          : ""
      }

      <div>

        <h3>
          ${esc(
            o.product_name ||
            "Product"
          )}
        </h3>

        <p>
          <b>Customer:</b>
          ${esc(
            o.Customer_Name ||
            ""
          )}
        </p>

        <p>
          <b>Mobile:</b>
          ${esc(
            o.User_Mobile ||
            ""
          )}
        </p>

        <p>
          <b>Address:</b>
          ${esc(
            o.Address ||
            ""
          )}
        </p>

        ${
          o.color
            ? `
              <p>
                <b>Colour:</b>
                ${esc(o.color)}
              </p>
            `
            : ""
        }

        <p>
          <b>Size:</b>
          ${esc(
            o.size ||
            "Free Size"
          )}

          &nbsp;

          <b>Qty:</b>
          ${esc(
            o.quantity ||
            0
          )}
        </p>

        <p>
          <b>Amount:</b>
          ₹${Number(
            o.total_amount ||
            0
          ).toLocaleString(
            "en-IN"
          )}
        </p>

        <p>
          <b>Expected delivery:</b>
          ${esc(delivery)}
        </p>

        <label
          class="
            order-status-label
          "
        >

          Update status

          <select
            class="order-status"
            onchange="
              updateOrderStatus(
                ${Number(o.id)},
                this.value
              )
            "
          >

            ${ORDER_STATUSES
              .map(
                s => `
                  <option
                    value="${esc(s)}"
                    ${
                      String(
                        o.status ||
                        "Pending"
                      ) === s
                        ? "selected"
                        : ""
                    }
                  >
                    ${esc(s)}
                  </option>
                `
              )
              .join("")}

          </select>

        </label>

      </div>

    </div>
  `;

  $("orderDetailModal")
    .classList
    .remove("hidden");
}

// --------------------------------------------------
// UPDATE ORDER STATUS
// --------------------------------------------------

async function updateOrderStatus(
  id,
  status
) {

  const {
    error
  } = await sb
    .from("Order")
    .update({
      status
    })
    .eq("id", id);

  if (error) {

    console.error(
      "Order status update error:",
      error
    );

    toast(
      "Could not update order. Check UPDATE policy."
    );

    await loadOrders();

    return;
  }

  toast(
    "Order status updated"
  );

  await loadOrders();

  openOrderDetail(id);
}

// --------------------------------------------------
// ORDER SEARCH / FILTER
// --------------------------------------------------

$("orderSearch")
  ?.addEventListener(
    "input",
    renderOrders
  );

$("orderFilter")
  ?.addEventListener(
    "change",
    renderOrders
  );

$("refreshOrdersBtn")
  ?.addEventListener(
    "click",
    loadOrders
);

// --------------------------------------------------
// CLOSE ORDER DETAIL
// --------------------------------------------------

$("closeOrderDetail")
  ?.addEventListener(
    "click",
    () => {
      $("orderDetailModal")
        .classList
        .add("hidden");
    }
  );

$("orderDetailModal")
  ?.addEventListener(
    "click",
    e => {

      if (
        e.target ===
        $("orderDetailModal")
      ) {

        $("orderDetailModal")
          .classList
          .add("hidden");
      }

    }
  );

// --------------------------------------------------
// START
// --------------------------------------------------

boot();
