-- =========================================================================
-- Little Chef Pizza — seed.sql
-- Run AFTER schema.sql. Mirrors js/seed-data.js exactly so the demo
-- (localStorage) and production (Supabase) data stay in sync.
-- Items flagged verified=false need a manual re-check against the
-- physical menu before going live (see comments).
-- =========================================================================

-- ------------------------------------------------------------ categories
insert into public.categories (name, sort_order) values
 ('Our Special Pizzas', 1), ('Our Regular Pizzas', 2), ('Little Chef Deals', 3),
 ('Fried Corner', 4), ('Rolls', 5), ('Oven Baked Wings', 6), ('Chipotley Saucy', 7),
 ('Special Wrap', 8), ('Sandwich', 9), ('Oven Baked Pasta', 10), ('Platters', 11),
 ('Pizza Fries', 12), ('Calzone & Cheese Stick', 13), ('Drinks', 14);

-- --------------------------------------------------------------- products
-- Special Pizzas
insert into public.products (category_id, name, description, sizes, verified) values
 ((select id from public.categories where name='Our Special Pizzas'), 'Little Chef Special Pizza', 'Tomato, olives, sausages, mushroom.', '{"S":690,"M":1180,"L":1790,"F":2650}', true),
 ((select id from public.categories where name='Our Special Pizzas'), 'Chicken Extreme Pizza', 'Special sauce, chicken, onion, capsicum, mushroom, red jalapeno, 3 types of chicken.', '{"S":690,"M":1180,"L":1790,"F":2650}', true),
 ((select id from public.categories where name='Our Special Pizzas'), 'Bonfire', 'Dip sauce, chicken, onion, capsicum, cheese.', '{"S":690,"M":1180,"L":1790,"F":2650}', true),
 ((select id from public.categories where name='Our Special Pizzas'), 'Peri-Peri Pizza', 'Peri peri sauce, chicken, capsicum, onion, cheese.', '{"S":690,"M":1180,"L":1790,"F":2650}', true),
 ((select id from public.categories where name='Our Special Pizzas'), 'Malai Boti Pizza', 'Special sauce, onion, malai boti, red jalapeno, cheese, onion, tomato.', '{"S":690,"M":1180,"L":1790,"F":2650}', true),
 ((select id from public.categories where name='Our Special Pizzas'), 'Behari Kebab Pizza', 'Special sauce, onion, chicken, capsicum, green jalapeno, cheese, kebab.', '{"M":1250,"L":1880,"F":2850}', true),
 ((select id from public.categories where name='Our Special Pizzas'), 'Crown Crust', 'Special sauce, onion, chicken, capsicum, olives, tomato, cheese.', '{"M":1390,"L":2050,"F":2970}', true),
 ((select id from public.categories where name='Our Special Pizzas'), 'Chicken Stuffer', 'Special sauce, chicken, chicken kebab, onion, capsicum.', '{"M":1350,"L":2050,"F":2870}', true),
 -- TODO: VERIFY THIS MENU ITEM/PRICE AGAINST ORIGINAL MENU IMAGE (description nearly identical to Chicken Stuffer)
 ((select id from public.categories where name='Our Special Pizzas'), 'Kebab Stuffer', 'Special sauce, chicken, chicken kebab, onion, capsicum. (verify vs Chicken Stuffer)', '{"M":1350,"L":2050,"F":2870}', false),
 ((select id from public.categories where name='Our Special Pizzas'), 'Cheese Stuffer', 'Special sauce, chicken, onion, tomato, olives, cheese.', '{"M":1350,"L":2050,"F":2870}', true);

-- Regular Pizzas
insert into public.products (category_id, name, description, sizes, verified) values
 ((select id from public.categories where name='Our Regular Pizzas'), 'Chicken Tikka Pizza', 'Tomato sauce, onion, chicken tikka, cheese.', '{"S":650,"M":1130,"L":1670,"F":2450}', true),
 ((select id from public.categories where name='Our Regular Pizzas'), 'Cheese Lover', 'Tomato sauce, double cheese, onion, cheese.', '{"S":650,"M":1130,"L":1670,"F":2450}', true),
 ((select id from public.categories where name='Our Regular Pizzas'), 'Chicken Supreme', 'Tomato sauce, chicken, capsicum, olives, onion, cheese.', '{"S":650,"M":1130,"L":1670,"F":2450}', true),
 ((select id from public.categories where name='Our Regular Pizzas'), 'Fajita Pizza', 'Chicken fajita, onion, capsicum, tomato, cheese.', '{"S":650,"M":1130,"L":1670,"F":2450}', true),
 ((select id from public.categories where name='Our Regular Pizzas'), 'Vegetable Pizza', 'Tomato sauce, capsicum, mushroom, onion, olives, cheese.', '{"S":650,"M":1130,"L":1670,"F":2450}', true),
 ((select id from public.categories where name='Our Regular Pizzas'), 'Hot & Spicy', 'Tomato sauce, jalapeno, capsicum, onion, cheese.', '{"S":650,"M":1130,"L":1670,"F":2450}', true);

-- Fried Corner  -- TODO: VERIFY prices/pairing against original photo (column alignment was partially unclear)
insert into public.products (category_id, name, price, verified) values
 ((select id from public.categories where name='Fried Corner'), 'Tower Burger', 710, true),
 ((select id from public.categories where name='Fried Corner'), 'Tender Fillet Burger', 480, true),
 ((select id from public.categories where name='Fried Corner'), 'Zinger Burger', 450, true),
 ((select id from public.categories where name='Fried Corner'), 'Zinger Cheese Burger', 530, true),
 ((select id from public.categories where name='Fried Corner'), 'Chicken Petty Burger', 330, false),
 ((select id from public.categories where name='Fried Corner'), 'Petty Cheese Burger', 390, false),
 ((select id from public.categories where name='Fried Corner'), 'Hot Wings (10 Pcs)', 630, true),
 ((select id from public.categories where name='Fried Corner'), 'Nuggets (10 Pcs)', 380, false),
 ((select id from public.categories where name='Fried Corner'), 'Mayo Fries (Small)', 290, false),
 ((select id from public.categories where name='Fried Corner'), 'Fries (Large)', 420, false),
 ((select id from public.categories where name='Fried Corner'), 'Fries (Small)', 280, false),
 ((select id from public.categories where name='Fried Corner'), 'Cheese Slice', 70, false);

-- Rolls
insert into public.products (category_id, name, price, verified) values
 ((select id from public.categories where name='Rolls'), 'Spin Roll', 550, true),
 ((select id from public.categories where name='Rolls'), 'Malai Boti Roll', 550, true),
 ((select id from public.categories where name='Rolls'), 'Chilli Milli Roll', 600, true);

-- Oven Baked Wings
insert into public.products (category_id, name, price, verified) values
 ((select id from public.categories where name='Oven Baked Wings'), 'Peri-Peri Wings (6 Pcs)', 400, true),
 ((select id from public.categories where name='Oven Baked Wings'), 'Oven Baked Wings (6 Pcs)', 350, true),
 ((select id from public.categories where name='Oven Baked Wings'), 'Peri-Peri Wings (12 Pcs)', 800, true),
 ((select id from public.categories where name='Oven Baked Wings'), 'Oven Baked Wings (10 Pcs)', 700, true);

-- Chipotley Saucy
insert into public.products (category_id, name, price, verified) values
 ((select id from public.categories where name='Chipotley Saucy'), 'Chipotley Saucy Wings (5 Pcs)', 350, true),
 ((select id from public.categories where name='Chipotley Saucy'), 'Chipotley Saucy Wings (10 Pcs)', 700, true);

-- Special Wrap
insert into public.products (category_id, name, price, verified) values
 ((select id from public.categories where name='Special Wrap'), 'Special Wrap', 500, true);

-- Sandwich
insert into public.products (category_id, name, price, verified) values
 ((select id from public.categories where name='Sandwich'), 'Tikka Sandwich', 400, true),
 ((select id from public.categories where name='Sandwich'), 'Chicken Sandwich', 700, false),
 ((select id from public.categories where name='Sandwich'), 'Mexican Sandwich', 700, false),
 ((select id from public.categories where name='Sandwich'), 'Fries Staker', 1000, false);

-- Oven Baked Pasta (Half/Full)
insert into public.products (category_id, name, sizes, verified) values
 ((select id from public.categories where name='Oven Baked Pasta'), 'Al Frado Pasta', '{"Half":470,"Full":800}', true),
 ((select id from public.categories where name='Oven Baked Pasta'), 'Creamy Pasta', '{"Half":500,"Full":800}', true),
 ((select id from public.categories where name='Oven Baked Pasta'), 'Flaming Pasta', '{"Half":450,"Full":740}', false),
 ((select id from public.categories where name='Oven Baked Pasta'), 'Crunchy Pasta', '{"Half":470,"Full":780}', false);

-- Platters
insert into public.products (category_id, name, description, price, verified) values
 ((select id from public.categories where name='Platters'), 'Special Platter', 'Oven baked wings (4 pcs), spin roll (4 pcs), 1 small fries, 1 dip sauce.', 1100, true),
 ((select id from public.categories where name='Platters'), 'Malai Boti Platter', 'Malai boti wings (6 pcs), malai boti roll (4 pcs), 1 small fries, 1 dip sauce.', 1200, true);

-- Pizza Fries
insert into public.products (category_id, name, price, verified) values
 ((select id from public.categories where name='Pizza Fries'), 'Pizza Fries', 690, true);

-- Calzone & Cheese Stick
insert into public.products (category_id, name, price, verified) values
 ((select id from public.categories where name='Calzone & Cheese Stick'), 'Calzone Chunk', 1200, true),
 ((select id from public.categories where name='Calzone & Cheese Stick'), 'Cheese Stick', 790, true),
 ((select id from public.categories where name='Calzone & Cheese Stick'), 'Chicken Cheese Stick', 1000, true);

-- Drinks
insert into public.products (category_id, name, price, verified) values
 ((select id from public.categories where name='Drinks'), 'Soft Drink 500ml', 130, true),
 ((select id from public.categories where name='Drinks'), 'Soft Drink Tin', 70, true),
 ((select id from public.categories where name='Drinks'), 'Soft Drink 1 Liter', 170, true),
 ((select id from public.categories where name='Drinks'), 'Mineral Water (Small)', 70, false),
 ((select id from public.categories where name='Drinks'), 'Mineral Water (Large)', 120, false),
 ((select id from public.categories where name='Drinks'), 'Soft Drink 1.5 Liter', 210, false);

-- Feature a handful of items on the homepage
update public.products set featured = true where name in
 ('Little Chef Special Pizza','Chicken Extreme Pizza','Malai Boti Pizza','Zinger Burger','Malai Boti Platter');

-- ------------------------------------------------------------------ deals
insert into public.deals (name, description, price, featured) values
 ('Deal 1', '1 Special Pizza (Large) + 10 Hot Wings + 1.5 Ltr Drink', 2450, true),
 ('Deal 3', '1 Medium Pizza + 6 Hot Wings + 1 Ltr Drink', 1600, false),
 ('Deal 4', '1 Large Pizza (Regular) + 1 Small Pizza + 1.5 Ltr Drink', 2480, false),
 ('Deal 5', '1 Large Pizza (Regular) + 2 Zinger Burgers + 2 Petty Burgers + 1.5 Ltr Drink', 3200, true),
 ('Deal 6', '2 Large Pizzas (Regular) + 1 Large Fries + 1.5 Ltr Drink', 3900, false);

-- TODO: VERIFY "1 Half Ltr Drink" wording against original menu image before enabling
insert into public.deals (name, description, price, verified) values
 ('Deal 2', '1 Small Pizza (Regular) + 1 Creamy Pasta + 1 Half Ltr Drink', 1450, false);

-- deal_items — reference products rather than duplicating data (spec section 18)
insert into public.deal_items (deal_id, product_id, size, quantity, note) values
 ((select id from public.deals where name='Deal 1'), (select id from public.products where name='Little Chef Special Pizza'), 'L', 1, 'any special pizza, large'),
 ((select id from public.deals where name='Deal 1'), (select id from public.products where name='Hot Wings (10 Pcs)'), null, 1, null),
 ((select id from public.deals where name='Deal 1'), (select id from public.products where name='Soft Drink 1.5 Liter'), null, 1, null),

 ((select id from public.deals where name='Deal 2'), (select id from public.products where name='Chicken Tikka Pizza'), 'S', 1, 'any regular pizza, small'),
 ((select id from public.deals where name='Deal 2'), (select id from public.products where name='Creamy Pasta'), 'Half', 1, null),
 ((select id from public.deals where name='Deal 2'), (select id from public.products where name='Soft Drink 500ml'), null, 1, null),

 ((select id from public.deals where name='Deal 3'), (select id from public.products where name='Chicken Tikka Pizza'), 'M', 1, 'any regular pizza, medium'),
 ((select id from public.deals where name='Deal 3'), (select id from public.products where name='Oven Baked Wings (6 Pcs)'), null, 1, null),
 ((select id from public.deals where name='Deal 3'), (select id from public.products where name='Soft Drink 1 Liter'), null, 1, null),

 ((select id from public.deals where name='Deal 4'), (select id from public.products where name='Chicken Tikka Pizza'), 'L', 1, null),
 ((select id from public.deals where name='Deal 4'), (select id from public.products where name='Chicken Tikka Pizza'), 'S', 1, null),
 ((select id from public.deals where name='Deal 4'), (select id from public.products where name='Soft Drink 1.5 Liter'), null, 1, null),

 ((select id from public.deals where name='Deal 5'), (select id from public.products where name='Chicken Tikka Pizza'), 'L', 1, null),
 ((select id from public.deals where name='Deal 5'), (select id from public.products where name='Zinger Burger'), null, 2, null),
 ((select id from public.deals where name='Deal 5'), (select id from public.products where name='Petty Cheese Burger'), null, 2, null),
 ((select id from public.deals where name='Deal 5'), (select id from public.products where name='Soft Drink 1.5 Liter'), null, 1, null),

 ((select id from public.deals where name='Deal 6'), (select id from public.products where name='Chicken Tikka Pizza'), 'L', 2, null),
 ((select id from public.deals where name='Deal 6'), (select id from public.products where name='Fries (Large)'), null, 1, null),
 ((select id from public.deals where name='Deal 6'), (select id from public.products where name='Soft Drink 1.5 Liter'), null, 1, null);

-- ---------------------------------------------------------- delivery_areas
-- Verified Gujrat-CITY localities only — do not add surrounding towns
-- (Kharian, Lala Musa, Jalalpur Jattan, Kunjah, etc.) without re-verifying.
insert into public.delivery_areas (name, sort_order) values
 ('Ramtalai Chowk',1), ('Fawara Chowk',2), ('GTS Chowk',3), ('Katchery Chowk',4), ('Jail Chowk',5),
 ('Service More Chowk',6), ('Shaheen Chowk',7), ('Shahid Hamid Chowk',8), ('Bholoyan Wala Chowk',9), ('Pakistan Chowk',10);

-- ------------------------------------------------------------ site_settings
insert into public.site_settings (key, value) values
 ('delivery_charge', 'null'),   -- TBD — spec section 26; update once finalized, e.g. '"150"'
 ('restaurant_info', '{
    "name":"Little Chef Pizza",
    "address":"Machli Chowk, Opp. Imam Bargah, East Circular Road, Gujrat, Punjab, Pakistan",
    "phone_primary":"053-3521111",
    "phone_secondary":"0371-0459420",
    "phone_whatsapp":"0323-8677541",
    "delivery_note":"Free delivery within 3 KM"
 }');

-- =========================================================================
-- IMPORTANT — creating the admin account
-- Never insert a plaintext or even pre-hashed admin password via SQL.
-- Create the admin user through Supabase Auth (Dashboard → Authentication →
-- "Add user", or the Admin API with the service role key from a trusted
-- server context only), using an internal email such as
-- admin@users.littlechefpizza.local, then insert exactly one matching row:
--
--   insert into public.profiles (auth_user_id, username, full_name, phone, role)
--   values ('<auth-user-uuid-from-dashboard>', 'admin', 'Restaurant Admin', '0300-0000000', 'admin');
--
-- There is intentionally no admin signup path anywhere in the application.
-- =========================================================================
