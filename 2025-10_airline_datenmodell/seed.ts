import { PrismaClient } from "model";
import { faker } from "@faker-js/faker";
const prisma = new PrismaClient();

const ensurePassengers = 1000;

// ensure 20 passengers
const existingPassengers = await prisma.Passenger.count();
for (let i = existingPassengers; i < ensurePassengers; i++) {
    await prisma.Passenger.create({
        data: {
            firstName: faker.person.firstName(),
            lastName: faker.person.lastName(),
            email: faker.internet.email(),
        },
    });
}
// ensure 20 plane

// ensure 20 airports

for (let i = 0; i < 10; i++) {
    const fake_airport = faker.airline.airport();
    await prisma.airport.create({
        data: {
            name: fake_airport.name,
            iataCode: fake_airport.iataCode,
            city: faker.location.city(),
        },
    });
}

// ensure 20 flights (depends on airports and planes)
