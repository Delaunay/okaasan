Recipes
=======

* This repository is solely for the server and ui of the recipe website.
  The data is kept separate inside a data repository.

Install
-------

.. code-block:: bash

   curl -sSL https://raw.githubusercontent.com/Delaunay/okaasan/master/install.sh | bash

Safe to re-run: upgrades the package, preserves data.
Installs to ``/opt/okaasan/`` with a Python virtual environment, systemd service, and data directory.

User Interface
--------------

The user interface has two mode

* Static: read only published website
* Dev: editable content


Server
------

* The server is only used in edit mode to add or modify recipes
* During the publishing step the server reply to routes are cached as JSON
  and used for the rendering

This enable us to deploy the website on github pages without requiring a database or a server



Lifestyle tracking
------------------

* Tracks things on different level independently and then link the independent measures together
    * Recipe Ingredient != Receipt Products

* Expense => Credit Card Item Easy to track
* Receipt => Itemized Expense, hard to track (and annoying)




