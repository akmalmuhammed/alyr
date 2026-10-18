"""The demo shops, one for every type of business that has a Catalog. Travel and documents
have none, so there is no shop for them."""

from alyr.demo.model import Shop
from alyr.demo.shops import bakery, fashion, grocery, restaurant, salon, shop, wholesale

SHOPS: tuple[Shop, ...] = (
    restaurant.SHOP, bakery.SHOP, grocery.SHOP, fashion.SHOP, shop.SHOP, wholesale.SHOP,
    salon.SHOP,
)
BY_KEY = {s.key: s for s in SHOPS}
