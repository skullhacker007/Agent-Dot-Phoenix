
import {
    mkdir,
    writeFile,
    stat,
    readdir,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Use the root directory containing this script.
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const directories = [
    // Next.js dashboard routes
    "app/(dashboard)/overview",
    "app/(dashboard)/leads",
    "app/(dashboard)/agents",
    "app/(dashboard)/tasks",
    "app/(dashboard)/analytics",
    "app/(dashboard)/settings",
    "app/api",

    // Shared components
    "components/ui",
    "components/layout",
    "components/data-tables",
    "components/charts",

    // Domain modules
    "modules/leads",
    "modules/agents",
    "modules/tasks",
    "modules/analytics",
    "modules/audit",

    // Server infrastructure
    "server/auth",
    "server/database",
    "server/queue",
    "server/events",
    "server/sources",
    "server/model-router",

    // Shared utilities
    "theme",
    "lib",

    // Agent workers
    "workers/master",
    "workers/research",
    "workers/verification",
    "workers/qualification",
    "workers/quality",

    // Database
    "prisma/migrations",

    // Tests
    "tests/unit",
    "tests/integration",
    "tests/e2e",

    // Supporting folders
    "scripts",
    "docs/adr",
];

const files = {
    "README.md":
        "# Dot Phoenix AI\n\n" +
        "Enterprise lead discovery, verification, qualification, " +
        "analytics, and agent monitoring platform.\n",

    "docs/ARCHITECTURE.md":
        "# Architecture\n\n" +
        "Architecture documentation will be added after approval.\n",

    "prisma/schema.prisma":
        "// Prisma schema will be added after database design approval.\n",

    "prisma/seed.ts":
        "// Database seed script will be added after schema approval.\n" +
        "export {};\n",

    ".env.example": [
        "# Template only. Never commit real secrets.",
        "DATABASE_URL=",
        "AUTH_SECRET=",
        "",
    ].join("\n"),

    "workers/master/README.md":
        "# Master Agent Worker\n\nPlaceholder for the master worker.\n",

    "workers/research/README.md":
        "# Research Worker\n\nPlaceholder for the research worker.\n",

    "workers/verification/README.md":
        "# Verification Worker\n\nPlaceholder for the verification worker.\n",

    "workers/qualification/README.md":
        "# Qualification Worker\n\nPlaceholder for the qualification worker.\n",

    "workers/quality/README.md":
        "# Quality Worker\n\nPlaceholder for the quality worker.\n",
};

async function getType(targetPath) {
    try {
        const info = await stat(targetPath);
        return info.isDirectory() ? "directory" : "file";
    } catch (error) {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    }
}

async function createStructure() {
    let createdDirs = 0;
    let existingDirs = 0;
    let createdFiles = 0;
    let existingFiles = 0;

    console.log("\nDot Phoenix AI: creating project structure\n");
    console.log(`Project root: ${ROOT}\n`);

    // Create missing directories without replacing existing ones.
    for (const relativePath of directories) {
        const fullPath = path.join(ROOT, relativePath);
        const type = await getType(fullPath);

        if (type === "file") {
            throw new Error(
                `Cannot create directory: a file already exists at ${relativePath}`
            );
        }

        if (type === "directory") {
            existingDirs++;
            console.log(`SKIP directory: ${relativePath}`);
            continue;
        }

        await mkdir(fullPath, { recursive: true });
        createdDirs++;
        console.log(`CREATE directory: ${relativePath}`);
    }

    // Create missing files only. Never overwrite existing files.
    for (const [relativePath, content] of Object.entries(files)) {
        const fullPath = path.join(ROOT, relativePath);
        const type = await getType(fullPath);

        if (type !== null) {
            existingFiles++;
            console.log(`SKIP file: ${relativePath} (preserved)`);
            continue;
        }

        await mkdir(path.dirname(fullPath), { recursive: true });

        try {
            await writeFile(fullPath, content, {
                encoding: "utf8",
                flag: "wx",
            });

            createdFiles++;
            console.log(`CREATE file: ${relativePath}`);
        } catch (error) {
            if (error.code === "EEXIST") {
                existingFiles++;
                console.log(`SKIP file: ${relativePath} (preserved)`);
                continue;
            }
            throw error;
        }
    }

    // Add .gitkeep only to completely empty directories.
    for (const relativePath of directories) {
        const fullPath = path.join(ROOT, relativePath);

        if ((await readdir(fullPath)).length !== 0) {
            continue;
        }

        try {
            await writeFile(path.join(fullPath, ".gitkeep"), "", {
                flag: "wx",
            });
        } catch (error) {
            if (error.code !== "EEXIST") {
                throw error;
            }
        }
    }

    console.log("\n========================================");
    console.log("Project structure setup complete");
    console.log("========================================");
    console.log(`Directories created: ${createdDirs}`);
    console.log(`Directories preserved: ${existingDirs}`);
    console.log(`Files created: ${createdFiles}`);
    console.log(`Files preserved: ${existingFiles}`);
    console.log("\nExisting project files were not overwritten.");
}

createStructure().catch((error) => {
    console.error("\nSetup failed:", error.message);
    process.exitCode = 1;
});
