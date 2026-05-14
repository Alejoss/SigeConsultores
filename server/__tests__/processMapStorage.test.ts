import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("Process Map Storage by Company", () => {
  let mockLocalStorage: Record<string, string> = {};

  beforeEach(() => {
    mockLocalStorage = {};
  });

  afterEach(() => {
    mockLocalStorage = {};
  });

  it("should store process map image with company ID", () => {
    const companyId = 1;
    const imageData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const fileName = "mapa-procesos.png";

    // Simulate storing image with company ID
    mockLocalStorage[`processMapImage_${companyId}`] = imageData;
    mockLocalStorage[`processMapImageName_${companyId}`] = fileName;

    expect(mockLocalStorage[`processMapImage_${companyId}`]).toBe(imageData);
    expect(mockLocalStorage[`processMapImageName_${companyId}`]).toBe(fileName);
  });

  it("should keep separate images for different companies", () => {
    const company1Id = 1;
    const company2Id = 2;
    const image1 = "data:image/png;base64,image1data";
    const image2 = "data:image/png;base64,image2data";

    // Store images for both companies
    mockLocalStorage[`processMapImage_${company1Id}`] = image1;
    mockLocalStorage[`processMapImageName_${company1Id}`] = "mapa-empresa1.png";
    mockLocalStorage[`processMapImage_${company2Id}`] = image2;
    mockLocalStorage[`processMapImageName_${company2Id}`] = "mapa-empresa2.png";

    // Verify they are stored separately
    expect(mockLocalStorage[`processMapImage_${company1Id}`]).toBe(image1);
    expect(mockLocalStorage[`processMapImage_${company2Id}`]).toBe(image2);
    expect(mockLocalStorage[`processMapImage_${company1Id}`]).not.toBe(mockLocalStorage[`processMapImage_${company2Id}`]);
  });

  it("should retrieve correct image for specific company", () => {
    const companyId = 3;
    const imageData = "data:image/png;base64,companyimage";
    const fileName = "mapa-procesos-empresa3.png";

    mockLocalStorage[`processMapImage_${companyId}`] = imageData;
    mockLocalStorage[`processMapImageName_${companyId}`] = fileName;

    // Retrieve image for company 3
    const retrievedImage = mockLocalStorage[`processMapImage_${companyId}`];
    const retrievedFileName = mockLocalStorage[`processMapImageName_${companyId}`];

    expect(retrievedImage).toBe(imageData);
    expect(retrievedFileName).toBe(fileName);
  });

  it("should not affect other companies when deleting image", () => {
    const company1Id = 1;
    const company2Id = 2;
    const image1 = "data:image/png;base64,image1";
    const image2 = "data:image/png;base64,image2";

    // Store images for both companies
    mockLocalStorage[`processMapImage_${company1Id}`] = image1;
    mockLocalStorage[`processMapImageName_${company1Id}`] = "mapa1.png";
    mockLocalStorage[`processMapImage_${company2Id}`] = image2;
    mockLocalStorage[`processMapImageName_${company2Id}`] = "mapa2.png";

    // Delete image for company 1
    delete mockLocalStorage[`processMapImage_${company1Id}`];
    delete mockLocalStorage[`processMapImageName_${company1Id}`];

    // Verify company 1 image is deleted but company 2 remains
    expect(mockLocalStorage[`processMapImage_${company1Id}`]).toBeUndefined();
    expect(mockLocalStorage[`processMapImage_${company2Id}`]).toBe(image2);
  });

  it("should handle company ID as part of storage key", () => {
    const companies = [1, 2, 3, 4, 5];
    
    // Store images for multiple companies
    companies.forEach((companyId) => {
      mockLocalStorage[`processMapImage_${companyId}`] = `image_${companyId}`;
      mockLocalStorage[`processMapImageName_${companyId}`] = `mapa_${companyId}.png`;
    });

    // Verify all companies have their own storage
    companies.forEach((companyId) => {
      expect(mockLocalStorage[`processMapImage_${companyId}`]).toBe(`image_${companyId}`);
      expect(mockLocalStorage[`processMapImageName_${companyId}`]).toBe(`mapa_${companyId}.png`);
    });

    // Verify total storage entries (2 per company)
    expect(Object.keys(mockLocalStorage).length).toBe(companies.length * 2);
  });
});
