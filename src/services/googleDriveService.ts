export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime: string;
}

/**
 * Lists DriveLogic backup files from Google Drive
 */
export async function listDriveFiles(token: string): Promise<GoogleDriveFile[]> {
  try {
    const q = encodeURIComponent("name contains 'drivelogic' and trashed = false");
    const fields = encodeURIComponent("files(id, name, mimeType, size, createdTime)");
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=createdTime desc`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Drive API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.files || [];
  } catch (error) {
    console.error("Failed to list Google Drive files:", error);
    throw error;
  }
}

/**
 * Creates or uploads a new backup file to Google Drive using multipart upload
 */
export async function createDriveFile(
  token: string,
  name: string,
  mimeType: string,
  content: string
): Promise<GoogleDriveFile> {
  try {
    const metadata = {
      name,
      mimeType,
      description: 'DriveLogicAI vehicle and trip backup',
    };

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${mimeType}\r\n\r\n` +
      content +
      closeDelimiter;

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to upload file to Google Drive: ${errText}`);
    }

    const file = await response.json();
    return file;
  } catch (error) {
    console.error("Failed to create Google Drive file:", error);
    throw error;
  }
}

/**
 * Downloads file content from Google Drive
 */
export async function downloadDriveFile(token: string, fileId: string): Promise<string> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to download Google Drive file: ${errText}`);
    }

    return await response.text();
  } catch (error) {
    console.error("Failed to download Google Drive file:", error);
    throw error;
  }
}

/**
 * Deletes a file from Google Drive
 */
export async function deleteDriveFile(token: string, fileId: string): Promise<void> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok && response.status !== 204 && response.status !== 404) {
      const errText = await response.text();
      throw new Error(`Failed to delete Google Drive file: ${errText}`);
    }
  } catch (error) {
    console.error("Failed to delete Google Drive file:", error);
    throw error;
  }
}
