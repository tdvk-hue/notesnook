/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

// Fork addition: tests for the per-notebook "Include notes on Homepage" flag.

import { databaseTest } from "./utils/index.js";
import { test, expect } from "vitest";
import Database from "../src/api/index.js";

async function homepageIds(db: Database) {
  return (await db.notes.homepage.ids()).sort();
}

async function setup(db: Database) {
  const unfiled = await db.notes.add({ title: "unfiled" });
  const inVisible = await db.notes.add({ title: "in visible" });
  const inHidden = await db.notes.add({ title: "in hidden" });
  const inBoth = await db.notes.add({ title: "in both" });

  const visibleNb = await db.notebooks.add({ title: "Visible" });
  const hiddenNb = await db.notebooks.add({ title: "Hidden" });

  await db.notes.addToNotebook(visibleNb, inVisible, inBoth);
  await db.notes.addToNotebook(hiddenNb, inHidden, inBoth);

  return { unfiled, inVisible, inHidden, inBoth, visibleNb, hiddenNb };
}

test("new notebooks default to showing on homepage", () =>
  databaseTest().then(async (db) => {
    const id = await db.notebooks.add({ title: "Default" });
    const notebook = await db.notebooks.notebook(id);
    expect(notebook?.showOnHomepage).toBe(true);
  }));

test("homepage shows all notes by default", () =>
  databaseTest().then(async (db) => {
    const ids = await setup(db);
    expect(await homepageIds(db)).toEqual(
      [ids.unfiled, ids.inVisible, ids.inHidden, ids.inBoth].sort()
    );
  }));

test("hidden notebook hides notes only in that notebook", () =>
  databaseTest().then(async (db) => {
    const ids = await setup(db);
    await db.notebooks.showOnHomepage(false, ids.hiddenNb);

    const home = await homepageIds(db);
    expect(home).toContain(ids.unfiled);
    expect(home).toContain(ids.inVisible);
    // multi-notebook note stays because one of its notebooks is visible
    expect(home).toContain(ids.inBoth);
    expect(home).not.toContain(ids.inHidden);

    // other views unchanged
    expect((await db.notes.all.ids()).length).toBe(4);
    expect(await db.notebooks.totalNotes(ids.hiddenNb)).toEqual([2]);
  }));

test("note hidden only when all its notebooks are hidden", () =>
  databaseTest().then(async (db) => {
    const ids = await setup(db);
    await db.notebooks.showOnHomepage(false, ids.hiddenNb, ids.visibleNb);

    expect(await homepageIds(db)).toEqual([ids.unfiled]);
  }));

test("turning the flag back on restores notes", () =>
  databaseTest().then(async (db) => {
    const ids = await setup(db);
    await db.notebooks.showOnHomepage(false, ids.hiddenNb);
    await db.notebooks.showOnHomepage(true, ids.hiddenNb);
    expect((await homepageIds(db)).length).toBe(4);
  }));

test("editing a notebook keeps its homepage flag", () =>
  databaseTest().then(async (db) => {
    const ids = await setup(db);
    await db.notebooks.showOnHomepage(false, ids.hiddenNb);
    await db.notebooks.add({ id: ids.hiddenNb, title: "Renamed" });

    const notebook = await db.notebooks.notebook(ids.hiddenNb);
    expect(notebook?.title).toBe("Renamed");
    expect(notebook?.showOnHomepage).toBe(false);
    expect(await homepageIds(db)).not.toContain(ids.inHidden);
  }));

test("nested notebooks are independent (no inheritance)", () =>
  databaseTest().then(async (db) => {
    const parent = await db.notebooks.add({ title: "Parent" });
    const child = await db.notebooks.add({ title: "Child" });
    await db.relations.add(
      { type: "notebook", id: parent },
      { type: "notebook", id: child }
    );
    const noteInChild = await db.notes.add({ title: "child note" });
    await db.notes.addToNotebook(child, noteInChild);

    await db.notebooks.showOnHomepage(false, parent);
    expect(await homepageIds(db)).toContain(noteInChild);

    await db.notebooks.showOnHomepage(false, child);
    expect(await homepageIds(db)).not.toContain(noteInChild);
  }));

test("archived and trashed notes stay excluded", () =>
  databaseTest().then(async (db) => {
    const ids = await setup(db);
    await db.notes.archive(true, ids.unfiled);
    await db.notes.moveToTrash(ids.inVisible);

    const home = await homepageIds(db);
    expect(home).not.toContain(ids.unfiled);
    expect(home).not.toContain(ids.inVisible);
  }));

test("trashed hidden notebook no longer hides its notes", () =>
  databaseTest().then(async (db) => {
    const ids = await setup(db);
    await db.notebooks.showOnHomepage(false, ids.hiddenNb);
    await db.notebooks.moveToTrash(ids.hiddenNb);

    expect(await homepageIds(db)).toContain(ids.inHidden);
  }));
