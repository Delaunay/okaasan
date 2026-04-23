from functools import wraps

def expose(*args, **kwargs):
    """
    Decorator to expose a route for static website generation.

    Args:
        *args:  Positional arguments, typically SQLAlchemy Select statements that return
                rows matching the route parameters (avoiding Cartesian product).
        **kwargs: Mapping of parameter names to:
                  - Lists of values
                  - Callables returning lists
                  - SQLAlchemy Select statements (executed to get list of values)
                  These will be combined using Cartesian product.
    """
    def decorator(f):
        # Store the parameter generators on the function object itself
        f._static_args = args
        f._static_kwargs = kwargs
        return f
    return decorator
