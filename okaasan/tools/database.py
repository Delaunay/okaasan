from sqlalchemy import create_engine, text
from sqlalchemy.schema import CreateTable, CreateIndex
import sys
import os


from ..server.models import Base, Event, Task, SubTask, User, Recipe, Ingredient, Category, RecipeIngredient, UnitConversion, IngredientComposition, ComposedRecipe


def dump_database_definition():
    """
    Generate SQLite database schema definition for all models.
    Returns the complete SQL DDL statements needed to create the database.
    """
    # Create an in-memory SQLite engine for schema generation
    engine = create_engine('sqlite:///:memory:', echo=False)

    # Generate the schema
    ddl_statements = []

    # Add header comment
    ddl_statements.append("-- SQLite Database Schema Definition")
    ddl_statements.append("-- Generated from SQLAlchemy models\n")

    # Get all tables from metadata in dependency order
    tables = Base.metadata.sorted_tables

    # Generate CREATE TABLE statements
    for table in tables:
        create_table = CreateTable(table)
        ddl_statement = str(create_table.compile(engine, compile_kwargs={"literal_binds": True}))
        ddl_statements.append(ddl_statement)
        ddl_statements.append("")  # Add empty line between tables

    # Generate CREATE INDEX statements for any indexes
    for table in tables:
        for index in table.indexes:
            create_index = CreateIndex(index)
            ddl_statement = str(create_index.compile(engine, compile_kwargs={"literal_binds": True}))
            ddl_statements.append(ddl_statement)

    # Join all statements
    schema_sql = "\n".join(ddl_statements)

    return schema_sql


def save_schema_to_file(filename="database_schema.sql"):
    """
    Save the database schema to a file.
    """
    schema = dump_database_definition()

    with open(filename, 'w') as f:
        f.write(schema)

    print(f"Database schema saved to {filename}")
    return filename


if __name__ == "__main__":
    # Print schema to stdout
    print(dump_database_definition())