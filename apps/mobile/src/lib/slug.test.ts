import { makeTripSlug } from "./slug"

describe("makeTripSlug", () => {
  it("slugifies the trip name and appends a random suffix", () => {
    jest.spyOn(Math, "random").mockReturnValue(0.123456)
    const slug = makeTripSlug("Bali Trip!!")
    expect(slug).toMatch(/^bali-trip-[a-z0-9]{4}$/)
  })

  it("falls back to 'trip' for a name with no alphanumeric characters", () => {
    jest.spyOn(Math, "random").mockReturnValue(0.123456)
    const slug = makeTripSlug("!!!")
    expect(slug).toMatch(/^trip-[a-z0-9]{4}$/)
  })
})
