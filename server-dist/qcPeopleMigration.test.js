import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateQcPeopleToUsers } from "./qcPeopleMigration.js";
test("QC master migration creates accounts, reuses users, skips duplicates and is repeatable", async () => {
    const legacy = [
        { id: "1", name: "Anamika", active: "Yes" },
        { id: "2", name: "Manash", active: "No" },
        { id: "3", name: "Sahil", active: "Yes" },
        { id: "4", name: "anamika", active: "Yes" },
        { id: "5", name: " ", active: "Yes" },
    ];
    const users = [{ id: "existing", userId: "sahil", name: "Old", password: "secret", designation: "Other", role: "Admin", status: "Inactive", menuAccess: '["*"]' }];
    const migrated = new Map();
    const query = async (sql, values = []) => {
        if (sql.startsWith("CREATE TABLE"))
            return [[], []];
        if (sql.startsWith("SELECT id, name, active"))
            return [legacy, []];
        if (sql.startsWith("SELECT legacyId FROM qc_person_user_migrations WHERE legacyId"))
            return [[...(migrated.has(values[0]) ? [{ legacyId: values[0] }] : [])], []];
        if (sql.startsWith("SELECT legacyId FROM qc_person_user_migrations WHERE LOWER"))
            return [[...([...migrated.values()].includes(values[0]) ? [{ legacyId: "claimed" }] : [])], []];
        if (sql.startsWith("SELECT id FROM users"))
            return [[...users.filter(user => user.userId.trim().toLowerCase() === values[0]).map(user => ({ id: user.id }))], []];
        if (sql.startsWith("UPDATE users")) {
            Object.assign(users.find(user => user.id === values[2]), { name: values[0], designation: "QC Person", status: values[1] });
            return [[], []];
        }
        if (sql.startsWith("INSERT INTO users")) {
            users.push({ id: values[0], userId: values[1], name: values[2], password: "12345", designation: "QC Person", role: "Employee", status: values[3], menuAccess: values[4] });
            return [[], []];
        }
        if (sql.startsWith("INSERT INTO qc_person_user_migrations")) {
            migrated.set(values[0], values[1]);
            return [[], []];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
    };
    const conn = { query, beginTransaction: async () => { }, commit: async () => { }, rollback: async () => { }, release: () => { } };
    const db = { query, getConnection: async () => conn };
    const oldWarn = console.warn;
    console.warn = () => { };
    try {
        await migrateQcPeopleToUsers(db);
        assert.equal(users.length, 3);
        assert.deepEqual([...migrated.entries()], [["1", "anamika"], ["2", "manash"], ["3", "sahil"]]);
        assert.equal(users.find(user => user.userId === "anamika")?.password, "12345");
        assert.equal(users.find(user => user.userId === "manash")?.status, "Inactive");
        assert.deepEqual(users.find(user => user.userId === "anamika")?.menuAccess, '["/quality"]');
        assert.equal(users[0].password, "secret");
        assert.equal(users[0].role, "Admin");
        assert.equal(users[0].menuAccess, '["*"]');
        assert.equal(users[0].designation, "QC Person");
        await migrateQcPeopleToUsers(db);
        assert.equal(users.length, 3);
        assert.equal(migrated.size, 3);
    }
    finally {
        console.warn = oldWarn;
    }
});
