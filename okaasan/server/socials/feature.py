from ..feature import Feature


class SocialsFeature(Feature):
    """Reads social-media data dumps straight off disk — no database, no
    background jobs, just routes."""

    name = "socials"

    def routers(self):
        from . import router
        return [router]
