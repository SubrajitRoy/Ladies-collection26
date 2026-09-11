const CONFIG = {
  SUPABASE_URL: "https://epceiyujnkqfqcepiyhi.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_l55MEex8L_TKB6ZiHvUqpA_evd3LBej",
  WHATSAPP_FALLBACK: "918259841223"
};

let sb = null;
let products = [];
let settings = { whatsapp_number: CONFIG.WHATSAPP_FALLBACK };
let currentProduct = null;
let selectedSize = "";
let currentQty = 1;
let cart = JSON.parse(localStorage.getItem("ladies_cart") || "[]");

function configured(){return !CONFIG.SUPABASE_URL.includes("PASTE_") && !CONFIG.SUPABASE_ANON_KEY.includes("PASTE_");}
if(configured()) sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

document.getElementById("year").textContent = new Date().getFullYear();

async function loadData(){
  if(sb){
    const {data:p,error:pe}=await sb.from("products").select("*").eq("is_published",true).order("created_at",{ascending:false});
    if(!pe) products=p||[];
    const {data:s}=await sb.from("site_settings").select("*").eq("id",1).maybeSingle();
    if(s && s.whatsapp_number) settings=s;
  }
  if(!products.length) products=[{
    id:"demo-1",name:"Printed Ladies Dress",category:"Dress",
    description:"Beautiful printed fabric collection. Contact us on WhatsApp for price and order confirmation.",
    sizes:["S","M","L","XL"],images:["assets/product-1-1.jpeg","assets/product-1-2.jpeg"],is_published:true
  }];
  populateCategories(); renderProducts(); updateCartCount(); updateWhatsAppLinks();
}
function populateCategories(){
  const select=document.getElementById("categoryFilter"), cats=[...new Set(products.map(p=>p.category).filter(Boolean))];
  select.innerHTML='<option value="all">All categories</option>'+cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
}
function renderProducts(){
  const filter=document.getElementById("categoryFilter").value, list=products.filter(p=>filter==="all"||p.category===filter);
  document.getElementById("emptyState").classList.toggle("hidden",list.length>0);
  document.getElementById("products").innerHTML=list.map(p=>`
    <article class="card" onclick="openProduct('${p.id}')">
      <img src="${esc(p.images?.[0]||'')}" alt="${esc(p.name)}" loading="lazy">
      <div class="card-body"><p class="eyebrow">${esc(p.category||"Collection")}</p><h3>${esc(p.name)}</h3><div class="sizes">Sizes: ${esc((p.sizes||[]).join(", ")||"Contact us")}</div></div>
    </article>`).join("");
}
function openProduct(id){
  currentProduct=products.find(p=>String(p.id)===String(id)); if(!currentProduct)return;
  selectedSize=(currentProduct.sizes||[])[0]||""; currentQty=1;
  document.getElementById("detailCategory").textContent=currentProduct.category||"COLLECTION";
  document.getElementById("detailName").textContent=currentProduct.name;
  document.getElementById("detailDescription").textContent=currentProduct.description||"";
  document.getElementById("detailQty").textContent=currentQty;
  const imgs=currentProduct.images||[];
  document.getElementById("detailMain").src=imgs[0]||"";
  document.getElementById("detailMain").alt=currentProduct.name;
  document.getElementById("detailThumbs").innerHTML=imgs.map((u,i)=>`<img class="${i===0?'active':''}" src="${esc(u)}" onclick="setMainImage('${escAttr(u)}',this)">`).join("");
  document.getElementById("sizeOptions").innerHTML=(currentProduct.sizes||[]).map(s=>`<button class="${s===selectedSize?'selected':''}" onclick="selectSize('${escAttr(s)}',this)">${esc(s)}</button>`).join("");
  document.getElementById("productModal").classList.remove("hidden");
}
function setMainImage(u,el){document.getElementById("detailMain").src=u;document.querySelectorAll("#detailThumbs img").forEach(x=>x.classList.remove("active"));el.classList.add("active")}
function selectSize(s,el){selectedSize=s;document.querySelectorAll("#sizeOptions button").forEach(x=>x.classList.remove("selected"));el.classList.add("selected")}
function changeQty(n){currentQty=Math.max(1,currentQty+n);document.getElementById("detailQty").textContent=currentQty}
function addCurrentToCart(){
  if(!currentProduct)return;
  if(!selectedSize){alert("Please select a size.");return}
  const key=`${currentProduct.id}__${selectedSize}`, existing=cart.find(x=>x.key===key);
  if(existing) existing.qty+=currentQty;
  else cart.push({key,id:currentProduct.id,name:currentProduct.name,size:selectedSize,qty:currentQty,image:currentProduct.images?.[0]||""});
  saveCart(); closeModal("productModal"); openCart();
}
function saveCart(){localStorage.setItem("ladies_cart",JSON.stringify(cart));updateCartCount()}
function updateCartCount(){document.getElementById("cartCount").textContent=cart.reduce((a,x)=>a+x.qty,0)}
function openCart(){
  const box=document.getElementById("cartItems"), empty=document.getElementById("cartEmpty"), fields=document.getElementById("customerFields"), wa=document.getElementById("cartWhatsApp");
  if(!cart.length){box.innerHTML="";empty.classList.remove("hidden");fields.classList.add("hidden");wa.classList.add("hidden")}
  else{
    empty.classList.add("hidden");fields.classList.remove("hidden");wa.classList.remove("hidden");
    box.innerHTML=cart.map((x,i)=>`<div class="cart-row"><img src="${esc(x.image)}"><div><strong>${esc(x.name)}</strong><small>Size: ${esc(x.size)} · Qty: ${x.qty}</small></div><button class="remove" onclick="removeCart(${i})">Remove</button></div>`).join("");
  }
  document.getElementById("cartModal").classList.remove("hidden");
}
function removeCart(i){cart.splice(i,1);saveCart();openCart()}
function orderCurrentWhatsApp(){
  if(!currentProduct||!selectedSize)return alert("Please select a size.");
  const msg=`Hello, I want to order:%0A%0AProduct: ${encodeURIComponent(currentProduct.name)}%0ASize: ${encodeURIComponent(selectedSize)}%0AQuantity: ${currentQty}%0A%0APlease share the price and order details.`;
  window.open(`https://wa.me/${cleanPhone(settings.whatsapp_number)}?text=${msg}`,"_blank");
}
function sendCartWhatsApp(){
  if(!cart.length)return;
  const name=document.getElementById("customerName").value.trim(),address=document.getElementById("customerAddress").value.trim(),phone=document.getElementById("customerPhone").value.trim();
  let msg=`Hello, I want to place an order from Ladies Collection.%0A%0A`;
  cart.forEach((x,i)=>msg+=`${i+1}. ${encodeURIComponent(x.name)} | Size: ${encodeURIComponent(x.size)} | Qty: ${x.qty}%0A`);
  if(name)msg+=`%0AName: ${encodeURIComponent(name)}`;
  if(phone)msg+=`%0APhone: ${encodeURIComponent(phone)}`;
  if(address)msg+=`%0AAddress: ${encodeURIComponent(address)}`;
  msg+=`%0A%0APlease share the price and confirm availability.`;
  window.open(`https://wa.me/${cleanPhone(settings.whatsapp_number)}?text=${msg}`,"_blank");
}
function updateWhatsAppLinks(){
  const p=cleanPhone(settings.whatsapp_number);
  document.getElementById("footerWhatsApp").href=`https://wa.me/${p}`;
}
function cleanPhone(x){return String(x||"").replace(/\D/g,"")||CONFIG.WHATSAPP_FALLBACK}
function closeModal(id){document.getElementById(id).classList.add("hidden")}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function escAttr(s){return String(s??"").replace(/\\/g,"\\\\").replace(/'/g,"\\'")}
loadData();
