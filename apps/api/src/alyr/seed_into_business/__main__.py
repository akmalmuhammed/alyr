import asyncio
import sys

from alyr.seed_into_business.cli import main

sys.exit(asyncio.run(main(sys.argv[1:])))
