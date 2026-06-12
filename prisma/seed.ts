import "../server/loadEnv";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.client.upsert({
    where: { email: "coordinacion@institutomar.es" },
    update: {},
    create: {
      email: "coordinacion@institutomar.es",
      firstName: "Clara",
      lastName: "Soler",
      fullName: "Clara Soler",
      isReturningCustomer: true,
      crmContactId: "ZOHO-CONTACT-001",
      crmAccountId: "ZOHO-ACCOUNT-015"
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
