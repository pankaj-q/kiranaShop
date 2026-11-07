-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_category_id_name_unit_key" ON "products"("category_id", "name", "unit");

