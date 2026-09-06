/**
 * seed-data.js
 * -----------------------------------------------------------------------
 * Initial menu data extracted from the physical Little Chef Pizza menu
 * (reference photos supplied by the restaurant). This is the SAME data
 * that was inserted into Supabase via supabase/seed.sql.
 *
 * ⚠️ NOW THAT THE APP IS WIRED TO REAL SUPABASE (js/db.js), the
 * `products`, `categories`, and `deals` arrays below are NO LONGER read
 * by the site — the live menu/deals/prices/availability all come from
 * the database now, and admin edits there take effect immediately. Those
 * arrays are kept here only as the historical record of what was seeded
 * and for reference if you ever need to re-seed.
 *
 * STILL ACTIVELY USED by the site: `restaurant` (footer/contact info) and
 * `delivery_areas` (the checkout area dropdown) — both are simple, mostly
 * static reference data, read directly from this file for convenience.
 * (They also exist in `public.site_settings` / `public.delivery_areas` in
 * Supabase if you'd rather manage them from the database instead.)
 *
 * Every item below includes `verified: true|false`.
 * `verified: false` means the name/price/description on the printed menu
 * was partially unclear in the photo and MUST be manually checked against
 * the original menu before going live. These items also carry a
 * `// TODO: VERIFY THIS MENU ITEM/PRICE AGAINST ORIGINAL MENU IMAGE` note.
 * (In the live database, the same flag is the `verified` column on
 * `products`/`deals` — shown as a "Verify" badge in the admin panel.)
 *
 * Prices are in PKR (integers, no decimals).
 * Sizes: S = Small, M = Medium, L = Large, F = Family
 * -----------------------------------------------------------------------
 */

const LCP_SEED = {

  restaurant: {
    name: "Little Chef Pizza",
    tagline: "Pizza & Fast Food",
    address: "Machli Chowk, Opp. Imam Bargah, East Circular Road, Gujrat, Punjab, Pakistan",
    phone_primary: "053-3521111",
    phone_secondary: "0371-0459420",
    phone_whatsapp: "0323-8677541",
    delivery_note: "Free delivery within 3 KM",
    hours: "TODO: Opening hours not visible on reference menu — confirm with restaurant"
  },

  categories: [
    { id: "cat-special-pizza",   name: "Our Special Pizzas",     sort_order: 1 },
    { id: "cat-regular-pizza",   name: "Our Regular Pizzas",     sort_order: 2 },
    { id: "cat-deals",           name: "Little Chef Deals",      sort_order: 3 },
    { id: "cat-fried-corner",    name: "Fried Corner",           sort_order: 4 },
    { id: "cat-rolls",           name: "Rolls",                  sort_order: 5 },
    { id: "cat-oven-wings",      name: "Oven Baked Wings",       sort_order: 6 },
    { id: "cat-chipotley",       name: "Chipotley Saucy",        sort_order: 7 },
    { id: "cat-special-wrap",    name: "Special Wrap",           sort_order: 8 },
    { id: "cat-sandwich",        name: "Sandwich",               sort_order: 9 },
    { id: "cat-oven-pasta",      name: "Oven Baked Pasta",       sort_order: 10 },
    { id: "cat-platter",         name: "Platters",               sort_order: 11 },
    { id: "cat-pizza-fries",     name: "Pizza Fries",            sort_order: 12 },
    { id: "cat-calzone",         name: "Calzone & Cheese Stick", sort_order: 13 },
    { id: "cat-drinks",          name: "Drinks",                 sort_order: 14 },
  ],

  /**
   * Products. Pizzas store a `sizes` map instead of a single `price`.
   * The cart/menu UI reads `base_price` (smallest available size) for
   * card display and lets the customer pick a size before adding to bucket.
   */
  products: [

    // ---------------- OUR SPECIAL PIZZAS ----------------
    { id:"p-special-lcp", category_id:"cat-special-pizza", name:"Little Chef Special Pizza",
      description:"Tomato, olives, sausages, mushroom.",
      sizes:{S:690,M:1180,L:1790,F:2650}, available:true, featured:true, verified:true },
    { id:"p-chicken-extreme", category_id:"cat-special-pizza", name:"Chicken Extreme Pizza",
      description:"Special sauce, chicken, onion, capsicum, mushroom, red jalapeno, 3 types of chicken.",
      sizes:{S:690,M:1180,L:1790,F:2650}, available:true, featured:true, verified:true },
    { id:"p-bonfire", category_id:"cat-special-pizza", name:"Bonfire",
      description:"Dip sauce, chicken, onion, capsicum, cheese.",
      sizes:{S:690,M:1180,L:1790,F:2650}, available:true, featured:false, verified:true },
    { id:"p-peri-peri-pizza", category_id:"cat-special-pizza", name:"Peri-Peri Pizza",
      description:"Peri peri sauce, chicken, capsicum, onion, cheese.",
      sizes:{S:690,M:1180,L:1790,F:2650}, available:true, featured:false, verified:true },
    { id:"p-malai-boti-pizza", category_id:"cat-special-pizza", name:"Malai Boti Pizza",
      description:"Special sauce, onion, malai boti, red jalapeno, cheese, onion, tomato.",
      sizes:{S:690,M:1180,L:1790,F:2650}, available:true, featured:true, verified:true },
    { id:"p-behari-kebab", category_id:"cat-special-pizza", name:"Behari Kebab Pizza",
      description:"Special sauce, onion, chicken, capsicum, green jalapeno, cheese, kebab.",
      sizes:{M:1250,L:1880,F:2850}, available:true, featured:false, verified:true },
    { id:"p-crown-crust", category_id:"cat-special-pizza", name:"Crown Crust",
      description:"Special sauce, onion, chicken, capsicum, olives, tomato, cheese.",
      sizes:{M:1390,L:2050,F:2970}, available:true, featured:false, verified:true },
    { id:"p-chicken-stuffer", category_id:"cat-special-pizza", name:"Chicken Stuffer",
      description:"Special sauce, chicken, chicken kebab, onion, capsicum.",
      sizes:{M:1350,L:2050,F:2870}, available:true, featured:false, verified:true },
    { id:"p-kebab-stuffer", category_id:"cat-special-pizza", name:"Kebab Stuffer",
      // TODO: VERIFY THIS MENU ITEM/PRICE AGAINST ORIGINAL MENU IMAGE
      // Description printed nearly identically to Chicken Stuffer above — confirm the real difference.
      description:"Special sauce, chicken, chicken kebab, onion, capsicum. (description unclear vs. Chicken Stuffer — verify)",
      sizes:{M:1350,L:2050,F:2870}, available:true, featured:false, verified:false },
    { id:"p-cheese-stuffer", category_id:"cat-special-pizza", name:"Cheese Stuffer",
      description:"Special sauce, chicken, onion, tomato, olives, cheese.",
      sizes:{M:1350,L:2050,F:2870}, available:true, featured:false, verified:true },

    // ---------------- OUR REGULAR PIZZAS ----------------
    { id:"p-chicken-tikka", category_id:"cat-regular-pizza", name:"Chicken Tikka Pizza",
      description:"Tomato sauce, onion, chicken tikka, cheese.",
      sizes:{S:650,M:1130,L:1670,F:2450}, available:true, featured:false, verified:true },
    { id:"p-cheese-lover", category_id:"cat-regular-pizza", name:"Cheese Lover",
      description:"Tomato sauce, double cheese, onion, cheese.",
      sizes:{S:650,M:1130,L:1670,F:2450}, available:true, featured:false, verified:true },
    { id:"p-chicken-supreme", category_id:"cat-regular-pizza", name:"Chicken Supreme",
      description:"Tomato sauce, chicken, capsicum, olives, onion, cheese.",
      sizes:{S:650,M:1130,L:1670,F:2450}, available:true, featured:false, verified:true },
    { id:"p-fajita-pizza", category_id:"cat-regular-pizza", name:"Fajita Pizza",
      description:"Chicken fajita, onion, capsicum, tomato, cheese.",
      sizes:{S:650,M:1130,L:1670,F:2450}, available:true, featured:false, verified:true },
    { id:"p-vegetable-pizza", category_id:"cat-regular-pizza", name:"Vegetable Pizza",
      description:"Tomato sauce, capsicum, mushroom, onion, olives, cheese.",
      sizes:{S:650,M:1130,L:1670,F:2450}, available:true, featured:false, verified:true },
    { id:"p-hot-spicy", category_id:"cat-regular-pizza", name:"Hot & Spicy",
      description:"Tomato sauce, jalapeno, capsicum, onion, cheese.",
      sizes:{S:650,M:1130,L:1670,F:2450}, available:true, featured:false, verified:true },

    // extra topping is a flat modifier, not a standalone product — handled in menu UI as a note.

    // ---------------- FRIED CORNER ----------------
    // TODO: VERIFY THIS MENU ITEM/PRICE AGAINST ORIGINAL MENU IMAGE
    // The price column in this section of the photo was partially cropped/rotated;
    // names and prices below are best-effort pairing and should be re-checked in person.
    { id:"p-tower-burger", category_id:"cat-fried-corner", name:"Tower Burger", description:"",
      price:710, available:true, featured:false, verified:true },
    { id:"p-tender-fillet-burger", category_id:"cat-fried-corner", name:"Tender Fillet Burger", description:"",
      price:480, available:true, featured:false, verified:true },
    { id:"p-zinger-burger", category_id:"cat-fried-corner", name:"Zinger Burger", description:"",
      price:450, available:true, featured:true, verified:true },
    { id:"p-zinger-cheese-burger", category_id:"cat-fried-corner", name:"Zinger Cheese Burger", description:"",
      price:530, available:true, featured:false, verified:true },
    { id:"p-chicken-petty-burger", category_id:"cat-fried-corner", name:"Chicken Petty Burger", description:"",
      price:330, available:true, featured:false, verified:false },
    { id:"p-petty-cheese-burger", category_id:"cat-fried-corner", name:"Petty Cheese Burger", description:"",
      price:390, available:true, featured:false, verified:false },
    { id:"p-hot-wings-10", category_id:"cat-fried-corner", name:"Hot Wings (10 Pcs)", description:"",
      price:630, available:true, featured:false, verified:true },
    { id:"p-nuggets-10", category_id:"cat-fried-corner", name:"Nuggets (10 Pcs)", description:"",
      price:380, available:true, featured:false, verified:false },
    { id:"p-mayo-fries-small", category_id:"cat-fried-corner", name:"Mayo Fries (Small)", description:"",
      price:290, available:true, featured:false, verified:false },
    { id:"p-fries-large", category_id:"cat-fried-corner", name:"Fries (Large)", description:"",
      price:420, available:true, featured:false, verified:false },
    { id:"p-fries-small", category_id:"cat-fried-corner", name:"Fries (Small)", description:"",
      price:280, available:true, featured:false, verified:false },
    { id:"p-cheese-slice", category_id:"cat-fried-corner", name:"Cheese Slice", description:"",
      price:70, available:true, featured:false, verified:false },

    // ---------------- ROLLS ----------------
    { id:"p-spin-roll", category_id:"cat-rolls", name:"Spin Roll", description:"",
      price:550, available:true, featured:false, verified:true },
    { id:"p-malai-boti-roll", category_id:"cat-rolls", name:"Malai Boti Roll", description:"",
      price:550, available:true, featured:false, verified:true },
    { id:"p-chilli-milli-roll", category_id:"cat-rolls", name:"Chilli Milli Roll", description:"",
      price:600, available:true, featured:false, verified:true },

    // ---------------- OVEN BAKED WINGS ----------------
    { id:"p-peri-wings-6", category_id:"cat-oven-wings", name:"Peri-Peri Wings (6 Pcs)", description:"",
      price:400, available:true, featured:false, verified:true },
    { id:"p-oven-wings-6", category_id:"cat-oven-wings", name:"Oven Baked Wings (6 Pcs)", description:"",
      price:350, available:true, featured:false, verified:true },
    { id:"p-peri-wings-12", category_id:"cat-oven-wings", name:"Peri-Peri Wings (12 Pcs)", description:"",
      price:800, available:true, featured:false, verified:true },
    { id:"p-oven-wings-10", category_id:"cat-oven-wings", name:"Oven Baked Wings (10 Pcs)", description:"",
      price:700, available:true, featured:false, verified:true },

    // ---------------- CHIPOTLEY SAUCY ----------------
    { id:"p-chipotley-5", category_id:"cat-chipotley", name:"Chipotley Saucy Wings (5 Pcs)", description:"",
      price:350, available:true, featured:false, verified:true },
    { id:"p-chipotley-10", category_id:"cat-chipotley", name:"Chipotley Saucy Wings (10 Pcs)", description:"",
      price:700, available:true, featured:false, verified:true },

    // ---------------- SPECIAL WRAP ----------------
    { id:"p-special-wrap", category_id:"cat-special-wrap", name:"Special Wrap", description:"",
      price:500, available:true, featured:false, verified:true },

    // ---------------- SANDWICH ----------------
    { id:"p-tikka-sandwich", category_id:"cat-sandwich", name:"Tikka Sandwich", description:"",
      price:400, available:true, featured:false, verified:true },
    { id:"p-chicken-sandwich", category_id:"cat-sandwich", name:"Chicken Sandwich", description:"",
      price:700, available:true, featured:false, verified:false },
    { id:"p-mexican-sandwich", category_id:"cat-sandwich", name:"Mexican Sandwich", description:"",
      // TODO: VERIFY THIS MENU ITEM/PRICE AGAINST ORIGINAL MENU IMAGE
      price:700, available:true, featured:false, verified:false },
    { id:"p-fries-staker", category_id:"cat-sandwich", name:"Fries Staker", description:"",
      price:1000, available:true, featured:false, verified:false },

    // ---------------- OVEN BAKED PASTA (Half / Full) ----------------
    { id:"p-al-frado-pasta", category_id:"cat-oven-pasta", name:"Al Frado Pasta", description:"",
      sizes:{Half:470,Full:800}, available:true, featured:false, verified:true },
    { id:"p-creamy-pasta", category_id:"cat-oven-pasta", name:"Creamy Pasta", description:"",
      sizes:{Half:500,Full:800}, available:true, featured:false, verified:true },
    { id:"p-flaming-pasta", category_id:"cat-oven-pasta", name:"Flaming Pasta", description:"",
      sizes:{Half:450,Full:740}, available:true, featured:false, verified:false },
    { id:"p-crunchy-pasta", category_id:"cat-oven-pasta", name:"Crunchy Pasta", description:"",
      sizes:{Half:470,Full:780}, available:true, featured:false, verified:false },

    // ---------------- PLATTERS ----------------
    { id:"p-special-platter", category_id:"cat-platter", name:"Special Platter",
      description:"Oven baked wings (4 pcs), spin roll (4 pcs), 1 small fries, 1 dip sauce.",
      price:1100, available:true, featured:false, verified:true },
    { id:"p-malai-boti-platter", category_id:"cat-platter", name:"Malai Boti Platter",
      description:"Malai boti wings (6 pcs), malai boti roll (4 pcs), 1 small fries, 1 dip sauce.",
      price:1200, available:true, featured:true, verified:true },

    // ---------------- PIZZA FRIES ----------------
    { id:"p-pizza-fries", category_id:"cat-pizza-fries", name:"Pizza Fries", description:"",
      price:690, available:true, featured:false, verified:true },

    // ---------------- CALZONE & CHEESE STICK ----------------
    { id:"p-calzone-chunk", category_id:"cat-calzone", name:"Calzone Chunk", description:"",
      price:1200, available:true, featured:false, verified:true },
    { id:"p-cheese-stick", category_id:"cat-calzone", name:"Cheese Stick", description:"",
      price:790, available:true, featured:false, verified:true },
    { id:"p-chicken-cheese-stick", category_id:"cat-calzone", name:"Chicken Cheese Stick", description:"",
      price:1000, available:true, featured:false, verified:true },

    // ---------------- DRINKS ----------------
    { id:"p-drink-500ml", category_id:"cat-drinks", name:"Soft Drink 500ml", description:"",
      price:130, available:true, featured:false, verified:true },
    { id:"p-drink-tin", category_id:"cat-drinks", name:"Soft Drink Tin", description:"",
      price:70, available:true, featured:false, verified:true },
    { id:"p-drink-1l", category_id:"cat-drinks", name:"Soft Drink 1 Liter", description:"",
      price:170, available:true, featured:false, verified:true },
    { id:"p-water-small", category_id:"cat-drinks", name:"Mineral Water (Small)", description:"",
      price:70, available:true, featured:false, verified:false },
    { id:"p-water-large", category_id:"cat-drinks", name:"Mineral Water (Large)", description:"",
      price:120, available:true, featured:false, verified:false },
    { id:"p-drink-15l", category_id:"cat-drinks", name:"Soft Drink 1.5 Liter", description:"",
      // TODO: VERIFY THIS MENU ITEM/PRICE AGAINST ORIGINAL MENU IMAGE
      price:210, available:true, featured:false, verified:false },
  ],

  /**
   * Deals reference products by id + quantity rather than duplicating data.
   * Deal price is independent of individual product prices.
   */
  deals: [
    { id:"deal-1", name:"Deal 1", description:"1 Special Pizza (Large) + 10 Hot Wings + 1.5 Ltr Drink",
      price:2450, available:true, featured:true, verified:true,
      items:[{product_id:"p-special-lcp", size:"L", qty:1, note:"any special pizza, large"},
             {product_id:"p-hot-wings-10", qty:1},
             {product_id:"p-drink-15l", qty:1}]},
    { id:"deal-2", name:"Deal 2", description:"1 Small Pizza (Regular) + 1 Creamy Pasta + 1 Half Ltr Drink",
      price:1450, available:true, featured:false, verified:false, // TODO: VERIFY "Half Ltr Drink" against original menu image
      items:[{product_id:"p-chicken-tikka", size:"S", qty:1, note:"any regular pizza, small"},
             {product_id:"p-creamy-pasta", size:"Half", qty:1},
             {product_id:"p-drink-500ml", qty:1}]},
    { id:"deal-3", name:"Deal 3", description:"1 Medium Pizza + 6 Hot Wings + 1 Ltr Drink",
      price:1600, available:true, featured:false, verified:true,
      items:[{product_id:"p-chicken-tikka", size:"M", qty:1, note:"any regular pizza, medium"},
             {product_id:"p-oven-wings-6", qty:1},
             {product_id:"p-drink-1l", qty:1}]},
    { id:"deal-4", name:"Deal 4", description:"1 Large Pizza (Regular) + 1 Small Pizza + 1.5 Ltr Drink",
      price:2480, available:true, featured:false, verified:true,
      items:[{product_id:"p-chicken-tikka", size:"L", qty:1}, {product_id:"p-chicken-tikka", size:"S", qty:1}, {product_id:"p-drink-15l", qty:1}]},
    { id:"deal-5", name:"Deal 5", description:"1 Large Pizza (Regular) + 2 Zinger Burgers + 2 Petty Burgers + 1.5 Ltr Drink",
      price:3200, available:true, featured:true, verified:true,
      items:[{product_id:"p-chicken-tikka", size:"L", qty:1}, {product_id:"p-zinger-burger", qty:2}, {product_id:"p-petty-cheese-burger", qty:2}, {product_id:"p-drink-15l", qty:1}]},
    { id:"deal-6", name:"Deal 6", description:"2 Large Pizzas (Regular) + 1 Large Fries + 1.5 Ltr Drink",
      price:3900, available:true, featured:false, verified:true,
      items:[{product_id:"p-chicken-tikka", size:"L", qty:2}, {product_id:"p-fries-large", qty:1}, {product_id:"p-drink-15l", qty:1}]},
  ],

  // Verified Gujrat-CITY delivery localities only (per restaurant brief — do not add surrounding towns).
  delivery_areas: [
    "Ramtalai Chowk", "Fawara Chowk", "GTS Chowk", "Katchery Chowk", "Jail Chowk",
    "Service More Chowk", "Shaheen Chowk", "Shahid Hamid Chowk", "Bholoyan Wala Chowk", "Pakistan Chowk"
  ],
};

if (typeof module !== "undefined") module.exports = LCP_SEED;
